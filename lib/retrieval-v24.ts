import { Citation, vectorSearchAnythingLLM } from "@/lib/anythingllm";
import {
  enhancedVectorSearch as enhancedVectorSearchV23,
  mergeGroundingCitations as mergeGroundingCitationsV23,
  retrievalPromptHint as retrievalPromptHintV23,
  type EnhancedCitation,
  type EnhancedRetrieval,
  type RetrievalIntent,
  type RetrievalPlan,
} from "@/lib/retrieval";

export const RETRIEVAL_VERSION = 2.5;
export type { EnhancedCitation, EnhancedRetrieval, RetrievalIntent, RetrievalPlan };

function compact(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalizeTitle(value: string | undefined) {
  return String(value || "")
    .replace(/\.md$/i, "")
    .replace(/[_＿]+/g, " ")
    .replace(/[\s|｜—–\-，。；：、！？【】（）()\[\]{}<>“”‘’'"`]+/g, "")
    .toLocaleLowerCase();
}

function citationKey(item: Citation) {
  if (item.url) return `url:${item.url}`;
  return `title:${normalizeTitle(item.title)}`;
}

function sameDocument(a: Citation, b: Citation) {
  if (a.url && b.url) return a.url === b.url;
  return normalizeTitle(a.title) === normalizeTitle(b.title);
}

function mergeChunkText(existing: string | undefined, incoming: string | undefined) {
  if (!incoming) return existing;
  if (!existing) return incoming;
  const existingChunks = String(existing)
    .split(/<retrieval_chunk>/i)
    .map(compact)
    .filter(Boolean);
  const incomingCompact = compact(incoming);
  if (!incomingCompact) return existing;
  if (existingChunks.some((chunk) => chunk.includes(incomingCompact) || incomingCompact.includes(chunk))) return existing;
  return `${existing}\n\n<retrieval_chunk>\n${incoming}`.slice(0, 26000);
}

function isSafetyQuestion(question: string) {
  return /(安全|safety|诈骗|消防|台风|高温|健康|充电宝|极端天气)/i.test(question);
}

function isTemporalQuestion(question: string) {
  return /(近期|最近|之前|以后|已经结束|已结束|过期|失效|有效|可参加|还能参加|报名|截止|日期|时间|upcoming|recent|expired|ended|deadline|still\s+open|validity)/i.test(question);
}

function focusTerms(question: string, intent: RetrievalIntent) {
  return [...new Set(focusTermGroups(question, intent).flat())];
}

function focusTermGroups(question: string, intent: RetrievalIntent) {
  const groups: string[][] = [];
  if (intent === "document-detail") {
    groups.push(
      ["原则", "条件", "资格", "对象", "组队", "要求"],
      ["操作", "流程", "平台", "系统", "登记", "申请", "步骤", "hive"],
      ["时间", "日期", "截止", "结束", "搬迁", "上午", "下午"],
    );
  }
  if (isSafetyQuestion(question)) {
    groups.push(
      ["高温", "防暑", "极端天气", "台风", "雷暴", "暴雨"],
      ["消防", "电池", "充电宝", "用电", "充电"],
      ["网络诈骗", "电信诈骗", "诈骗", "反诈", "验证码", "转账"],
    );
  }
  if (isTemporalQuestion(question)) {
    groups.push(
      ["活动日期", "会议日期", "展览时间", "开始", "结束", "报名截止", "截止日期", "展期", "时间"],
      ["会议", "年会", "conference"],
      ["展览", "照片展", "exhibition"],
      ["夏令营", "summer camp", "方向"],
    );
  }
  return groups
    .map((group) => [...new Set(group.map((item) => item.toLocaleLowerCase()))])
    .filter((group) => group.length);
}

function focusQuery(question: string, intent: RetrievalIntent, title: string) {
  if (intent === "document-detail") {
    return `${title} ${question} 原则 条件 资格 对象 组队 操作办法 流程 平台 系统 登记 申请 时间节点 截止 结束 注意事项`;
  }
  if (isSafetyQuestion(question)) {
    return `${title} 学生安全 高温 极端天气 台风 雷暴 消防 电池 充电宝 用电 网络诈骗 电信诈骗 反诈`;
  }
  if (isTemporalQuestion(question)) {
    return `${title} 活动日期 会议日期 展览时间 开始 结束 报名截止 截止日期 展期 夏令营 方向`;
  }
  return `${title} ${question}`;
}

function shouldRunDocumentPass(plan: RetrievalPlan, question: string) {
  return plan.intent === "document-detail" || isSafetyQuestion(question) || isTemporalQuestion(question);
}

function titleSimilarity(title: string | undefined, question: string) {
  const a = normalizeTitle(title);
  const b = normalizeTitle(question);
  if (!a || !b) return 0;
  const grams = (value: string) => {
    const set = new Set<string>();
    for (let i = 0; i < value.length - 1; i += 1) set.add(value.slice(i, i + 2));
    return set;
  };
  const left = grams(a);
  const right = grams(b);
  if (!left.size || !right.size) return a.includes(b) || b.includes(a) ? 1 : 0;
  let overlap = 0;
  left.forEach((gram) => {
    if (right.has(gram)) overlap += 1;
  });
  return overlap / Math.max(1, Math.min(left.size, right.size));
}

function evidenceFocusScore(item: Citation, question: string, intent: RetrievalIntent) {
  const terms = focusTerms(question, intent);
  if (!terms.length) return 0;
  const corpus = `${item.title || ""}\n${item.text || ""}`.toLocaleLowerCase();
  return terms.reduce((score, term) => score + (corpus.includes(term) ? 1 : 0), 0);
}

function rerank(results: EnhancedCitation[], question: string, intent: RetrievalIntent) {
  const indexed = results.map((item, index) => ({ item, index }));
  if (intent === "document-detail") {
    return indexed
      .sort((a, b) => {
        const titleDiff = titleSimilarity(b.item.title, question) - titleSimilarity(a.item.title, question);
        if (Math.abs(titleDiff) > 0.02) return titleDiff;
        const focusDiff = evidenceFocusScore(b.item, question, intent) - evidenceFocusScore(a.item, question, intent);
        if (focusDiff) return focusDiff;
        return a.index - b.index;
      })
      .map(({ item }) => item);
  }
  if (isSafetyQuestion(question) || isTemporalQuestion(question)) {
    return indexed
      .sort((a, b) => {
        const focusDiff = evidenceFocusScore(b.item, question, intent) - evidenceFocusScore(a.item, question, intent);
        if (focusDiff) return focusDiff;
        return a.index - b.index;
      })
      .map(({ item }) => item);
  }
  return results;
}

export async function enhancedVectorSearch(
  workspace: string,
  question: string,
  options?: { topN?: number; threshold?: number },
): Promise<EnhancedRetrieval> {
  const base = await enhancedVectorSearchV23(workspace, question, options);
  if (!shouldRunDocumentPass(base.plan, question) || !base.results.length) return base;

  const warnings: string[] = base.warning ? [base.warning] : [];
  const candidateLimit = base.plan.intent === "document-detail" ? 4 : 8;
  const candidates = base.results.slice(0, candidateLimit);
  const refinementQueries: string[] = [];

  for (const candidate of candidates) {
    const title = String(candidate.title || "").replace(/\.md$/i, "").replace(/[_＿]+/g, " ").trim();
    if (!title) continue;
    const query = compact(focusQuery(question, base.plan.intent, title));
    refinementQueries.push(query);
    try {
      const rows = await vectorSearchAnythingLLM(
        workspace,
        query,
        Math.max(10, base.plan.perQueryTopN),
        Math.min(base.plan.threshold, 0.15),
      );
      rows
        .filter((row) => sameDocument(row, candidate))
        .slice(0, 5)
        .forEach((row) => {
          candidate.text = mergeChunkText(candidate.text, row.text);
          if (!candidate.url && row.url) candidate.url = row.url;
          if (!candidate.source && row.source) candidate.source = row.source;
          if (!candidate.publishedDate && row.publishedDate) candidate.publishedDate = row.publishedDate;
          if (typeof row.score === "number" && (typeof candidate.score !== "number" || row.score > candidate.score)) candidate.score = row.score;
          candidate.queryHits = (candidate.queryHits || 0) + 1;
          candidate.rrfScore = (candidate.rrfScore || 0) + 1 / 61;
        });
    } catch (error) {
      warnings.push(`${query}: ${error instanceof Error ? error.message : "document-focused search failed"}`);
    }
  }

  const plan: RetrievalPlan = {
    ...base.plan,
    queries: [...base.plan.queries, ...refinementQueries],
  };

  return {
    plan,
    results: rerank(base.results, question, base.plan.intent).slice(0, base.plan.topN),
    warning: warnings.length ? warnings.join(" | ") : undefined,
  };
}

function cleanEvidenceText(value: string | undefined) {
  return String(value || "")
    .replace(/<document_metadata>[\s\S]*?<\/document_metadata>/gi, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function bestFocusedExcerpt(item: Citation, question: string, intent: RetrievalIntent, limit = 420) {
  const terms = focusTerms(question, intent);
  const groups = focusTermGroups(question, intent);
  const chunks = String(item.text || "")
    .split(/<retrieval_chunk>/i)
    .map(cleanEvidenceText)
    .filter(Boolean)
    .map((chunk, index) => {
      const lower = chunk.toLocaleLowerCase();
      return {
        chunk,
        index,
        score: terms.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0),
        groupScores: groups.map((group) => group.reduce((score, term) => score + (lower.includes(term) ? 1 : 0), 0)),
      };
    });
  if (!chunks.length) return "";

  const maxChunks = groups.length ? Math.min(3, groups.length) : Math.min(2, chunks.length);
  const selected: typeof chunks = [];
  const used = new Set<number>();

  groups.forEach((_, groupIndex) => {
    if (selected.length >= maxChunks) return;
    const candidate = chunks
      .filter((row) => !used.has(row.index) && row.groupScores[groupIndex] > 0)
      .sort((a, b) => b.groupScores[groupIndex] - a.groupScores[groupIndex] || b.score - a.score || a.index - b.index)[0];
    if (candidate) {
      selected.push(candidate);
      used.add(candidate.index);
    }
  });

  chunks
    .filter((row) => !used.has(row.index))
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .forEach((candidate) => {
      if (selected.length >= maxChunks) return;
      selected.push(candidate);
      used.add(candidate.index);
    });

  if (!selected.length) selected.push(chunks[0]);
  const perChunk = Math.max(120, Math.floor(limit / selected.length));
  return selected.map((row) => row.chunk.slice(0, perChunk)).join(" … ").slice(0, limit);
}

export function retrievalPromptHint(plan: RetrievalPlan, results: Citation[], options?: { compact?: boolean }) {
  const compactMode = Boolean(options?.compact);
  const base = retrievalPromptHintV23(plan, results, options).replace(/Retrieval 2\.3/g, `Retrieval ${RETRIEVAL_VERSION}`);
  const question = plan.queries[0] || "";
  if (!shouldRunDocumentPass(plan, question)) return base;

  const supplementLimit = compactMode
    ? (plan.intent === "document-detail" ? 2 : 4)
    : (plan.intent === "document-detail" ? 3 : 5);
  const excerptLimit = compactMode
    ? (plan.intent === "document-detail" ? 320 : 240)
    : (plan.intent === "document-detail" ? 660 : 420);

  const rows = results.slice(0, supplementLimit).map((item, index) => {
    const excerpt = bestFocusedExcerpt(item, question, plan.intent, excerptLimit);
    if (!excerpt) return "";
    const title = String(item.title || "Knowledge-base source").replace(/\.md$/i, "");
    return `\n[二次文档内证据 ${index + 1}]\n标题: ${title}\n${item.source ? `来源: ${item.source}\n` : ""}${item.publishedDate ? `文章发布日期: ${item.publishedDate}\n` : ""}原文链接: ${item.url || "文档未明确说明"}\n聚焦摘录: ${excerpt}`;
  }).filter(Boolean);

  if (!rows.length) return base;
  const rules = [
    `[Retrieval ${RETRIEVAL_VERSION} 二次文档内聚焦证据]`,
    compactMode
      ? "这是为上游重试保留的精简正文证据。即使处于 compact fallback，也必须以这些正文片段为事实依据，不能只看标题、发布日期或 URL。"
      : "以下证据来自已命中文档的二次局部检索。回答细节、日期与安全主题时优先综合这些片段，不要只使用文章末尾的联系方式或标题。",
  ];
  if (plan.intent === "document-detail") {
    rules.push("单篇详情问题应尽量覆盖不同信息组：原则/条件、操作/系统/流程、时间节点/截止。不要因为前两个片段信息较多就遗漏后面的时间节点。");
  }
  if (isSafetyQuestion(question)) {
    rules.push("安全汇总应分别检查天气/高温、消防与电池/充电宝、诈骗与资金安全等主题；正文证据出现具体风险点时应保留具体术语。若某主题没有证据，不要编造。 ");
  }
  if (isTemporalQuestion(question)) {
    rules.push("时效判断只能使用正文中明确写出的活动日期、开始/结束日期或报名截止日期。严禁根据文章发布日期、当前日期、活动名称或‘展览/春季招新通常有期限’之类常识推断。若只有发布日期或没有明确活动日期，必须写‘无法判断’，不得写‘可以推断可能已经结束’。 ");
  }
  return `${base}\n${rules.join("\n")}\n${rows.join("\n")}\n`;
}

export function mergeGroundingCitations(primary: Citation[], plan: RetrievalPlan, results: Citation[]) {
  return mergeGroundingCitationsV23(primary, plan, results);
}
