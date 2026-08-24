import { Citation, vectorSearchAnythingLLM } from "@/lib/anythingllm";
import type { RetrievalIntent, RetrievalPlan } from "@/lib/retrieval-v24";

export const EVIDENCE_COMPOSER_VERSION = "1.0";

type EvidenceSlot = {
  id: string;
  label: string;
  query: string;
  terms: string[];
  target?: string;
};

type SlotEvidence = {
  slot: EvidenceSlot;
  citations: Citation[];
};

export type EvidenceBundle = {
  version: string;
  prompt: string;
  compactPrompt: string;
  citations: Citation[];
  slots: { id: string; label: string; target?: string; evidenceCount: number }[];
  warning?: string;
};

function compact(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

function normalize(value: string | undefined) {
  return String(value || "")
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\.md\b/g, "")
    .replace(/[_＿|｜—–\-，。；：、！？【】（）()\[\]{}<>“”‘’'"`\s]+/g, "");
}

function sameDocument(a: Citation, b: Citation) {
  if (a.url && b.url) return a.url === b.url;
  const left = normalize(a.title);
  const right = normalize(b.title);
  return Boolean(left && right && (left === right || left.includes(right) || right.includes(left)));
}

function citationKey(item: Citation) {
  return item.url ? `url:${item.url}` : `title:${normalize(item.title)}`;
}

function dedupe(items: Citation[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = citationKey(item);
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function cleanText(value: string | undefined) {
  return String(value || "")
    .replace(/<document_metadata>[\s\S]*?<\/document_metadata>/gi, " ")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, " ")
    .replace(/\[(https?:\/\/[^\]]+)\]\((https?:\/\/[^)]+)\)/g, "$1")
    .replace(/\s+/g, " ")
    .trim();
}

function splitChunks(item: Citation) {
  const rows = String(item.text || "")
    .split(/<retrieval_chunk>/i)
    .map(cleanText)
    .filter(Boolean);
  return rows.length ? rows : [cleanText(item.text)].filter(Boolean);
}

function uniqueTerms(values: string[]) {
  return [...new Set(values.map((value) => compact(value).toLocaleLowerCase()).filter((value) => value.length >= 2))];
}

function queryTerms(question: string) {
  const english = question.toLocaleLowerCase().match(/[a-z][a-z0-9-]{2,}/g) || [];
  const chinese = question.match(/[\p{Script=Han}]{2,10}/gu) || [];
  const stop = new Set(["哪些", "什么", "信息", "当前", "测试库中", "知识库中", "请分别", "判断", "以下", "活动", "是否", "已经", "结束", "只依据", "文档中的", "明确", "不得", "根据", "发布日期", "推断", "please", "what", "which", "from", "with", "about", "the", "and"]);
  return uniqueTerms([...chinese, ...english].filter((item) => !stop.has(item.toLocaleLowerCase()))).slice(0, 24);
}

function numberedTargets(question: string) {
  const rows = question
    .split(/\r?\n/)
    .map((line) => line.match(/^\s*\d+[.、)）]\s*(.+?)\s*$/)?.[1]?.trim())
    .filter((value): value is string => Boolean(value));
  return [...new Set(rows)].slice(0, 8);
}

function quotedTargets(question: string) {
  const rows: string[] = [];
  const regex = /[“"「『](.{3,80}?)[”"」』]/g;
  let match: RegExpExecArray | null;
  while ((match = regex.exec(question))) rows.push(match[1].trim());
  return [...new Set(rows)].slice(0, 6);
}

function isSafety(question: string) {
  return /(安全|safety|诈骗|消防|台风|高温|健康|充电宝|极端天气|电池)/i.test(question);
}

function isTemporal(question: string) {
  return /(日期|时间|截止|结束|失效|有效|报名|之前|以后|截至|ended|deadline|date|time|expired|validity)/i.test(question);
}

function buildSlots(question: string, intent: RetrievalIntent): EvidenceSlot[] {
  const baseTerms = queryTerms(question);
  const explicitTargets = numberedTargets(question);
  const quoted = quotedTargets(question);
  const slots: EvidenceSlot[] = [];

  if (isTemporal(question) && explicitTargets.length) {
    explicitTargets.forEach((target, index) => {
      slots.push({
        id: `target-${index + 1}`,
        label: `目标活动：${target}`,
        target,
        query: `${target} 活动日期 时间 开始 结束 截止 展期 报名日期`,
        terms: uniqueTerms([target, ...baseTerms, "活动日期", "时间", "开始", "结束", "截止", "展期"]),
      });
    });
    return slots;
  }

  if (intent === "document-detail") {
    slots.push(
      { id: "requirements", label: "原则 / 条件 / 资格", query: `${question} 原则 条件 资格 对象 组队 要求`, terms: uniqueTerms([...baseTerms, "原则", "条件", "资格", "对象", "组队", "要求"]) },
      { id: "procedure", label: "操作 / 平台 / 流程", query: `${question} 操作 流程 平台 系统 登记 申请 步骤`, terms: uniqueTerms([...baseTerms, "操作", "流程", "平台", "系统", "登记", "申请", "步骤", "hive"]) },
      { id: "dates", label: "时间节点 / 截止", query: `${question} 时间 日期 截止 结束 搬迁 上午 下午`, terms: uniqueTerms([...baseTerms, "时间", "日期", "截止", "结束", "搬迁", "上午", "下午"]) },
    );
    return slots;
  }

  if (isSafety(question)) {
    slots.push(
      { id: "weather", label: "天气 / 高温 / 极端天气", query: `${question} 高温 防暑 中暑 极端天气 台风 雷暴 暴雨`, terms: uniqueTerms([...baseTerms, "高温", "防暑", "中暑", "极端天气", "台风", "雷暴", "暴雨"]) },
      { id: "battery", label: "消防 / 电池 / 充电宝", query: `${question} 消防 电池 充电宝 充电 用电 火灾`, terms: uniqueTerms([...baseTerms, "消防", "电池", "充电宝", "充电", "用电", "火灾"]) },
      { id: "fraud", label: "网络诈骗 / 资金安全", query: `${question} 网络诈骗 电信诈骗 反诈 转账 验证码 金融诈骗`, terms: uniqueTerms([...baseTerms, "网络诈骗", "电信诈骗", "反诈", "转账", "验证码", "金融诈骗"]) },
    );
    return slots;
  }

  if (explicitTargets.length || quoted.length) {
    [...explicitTargets, ...quoted].slice(0, 6).forEach((target, index) => slots.push({
      id: `entity-${index + 1}`,
      label: `目标：${target}`,
      target,
      query: `${target} ${question}`,
      terms: uniqueTerms([target, ...baseTerms]),
    }));
    return slots;
  }

  slots.push({ id: "answer", label: "回答所需证据", query: question, terms: baseTerms });
  return slots;
}

function scoreChunk(item: Citation, chunk: string, slot: EvidenceSlot) {
  const title = String(item.title || "").toLocaleLowerCase();
  const source = String(item.source || "").toLocaleLowerCase();
  const lower = chunk.toLocaleLowerCase();
  let score = 0;
  for (const term of slot.terms) {
    if (title.includes(term)) score += 5;
    if (source.includes(term)) score += 2;
    if (lower.includes(term)) score += 1;
  }
  if (slot.target) {
    const target = normalize(slot.target);
    if (target && normalize(item.title).includes(target)) score += 18;
    if (target && normalize(chunk).includes(target)) score += 8;
  }
  return score;
}

function bestChunk(item: Citation, slot: EvidenceSlot, limit: number) {
  const chunks = splitChunks(item)
    .map((chunk, index) => ({ chunk, index, score: scoreChunk(item, chunk, slot) }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  const selected = chunks.slice(0, 2).filter((row, index) => row.score > 0 || index === 0);
  if (!selected.length) return "";
  const perChunk = Math.max(180, Math.floor(limit / selected.length));
  return selected.map((row) => row.chunk.slice(0, perChunk)).join(" … ").slice(0, limit);
}

function candidateForTarget(results: Citation[], target: string) {
  const targetNorm = normalize(target);
  if (!targetNorm) return undefined;
  return results
    .map((item) => {
      const title = normalize(item.title);
      const text = normalize(String(item.text || "").slice(0, 5000));
      let score = 0;
      if (title.includes(targetNorm) || targetNorm.includes(title)) score += 20;
      const pieces = target.match(/[\p{Script=Han}]{2,}|[A-Za-z][A-Za-z0-9-]{2,}/gu) || [];
      for (const piece of pieces) {
        const p = normalize(piece);
        if (!p) continue;
        if (title.includes(p)) score += 4;
        if (text.includes(p)) score += 1;
      }
      return { item, score };
    })
    .sort((a, b) => b.score - a.score)[0];
}

async function gatherSlotEvidence(workspace: string, slot: EvidenceSlot, baseResults: Citation[], threshold: number) {
  const warnings: string[] = [];
  let extra: Citation[] = [];
  try {
    extra = await vectorSearchAnythingLLM(workspace, slot.query, 10, Math.min(threshold, 0.12));
  } catch (error) {
    warnings.push(error instanceof Error ? error.message : "slot retrieval failed");
  }

  const targetCandidate = slot.target ? candidateForTarget(baseResults, slot.target) : undefined;
  const targetDoc = targetCandidate && targetCandidate.score >= 4 ? targetCandidate.item : undefined;
  const pool = [...baseResults, ...extra];
  const filtered = targetDoc ? pool.filter((item) => sameDocument(item, targetDoc)) : pool;

  const evidenceLimit = slot.target ? 2 : slot.id === "answer" ? 6 : 3;
  const ranked = filtered
    .map((item, index) => {
      const excerpt = bestChunk(item, slot, 900);
      return { item: { ...item, text: excerpt || item.text }, excerpt, index, score: excerpt ? scoreChunk(item, excerpt, slot) : 0 };
    })
    .filter((row) => row.excerpt)
    .sort((a, b) => b.score - a.score || a.index - b.index)
    .slice(0, evidenceLimit)
    .map((row) => row.item);

  return { citations: dedupe(ranked), warnings };
}

function evidenceBlock(slotEvidence: SlotEvidence, compactMode: boolean) {
  const limit = compactMode ? 420 : 780;
  const rows = slotEvidence.citations.map((item, index) => {
    const text = cleanText(item.text).slice(0, limit);
    return [
      `证据 ${index + 1}`,
      `标题: ${String(item.title || "Knowledge-base source").replace(/\.md$/i, "")}`,
      item.source ? `来源: ${item.source}` : "",
      item.publishedDate ? `文章发布日期: ${item.publishedDate}` : "",
      item.url ? `原文链接: ${item.url}` : "",
      text ? `正文摘录: ${text}` : "",
    ].filter(Boolean).join("\n");
  });
  return `\n[证据槽位：${slotEvidence.slot.label}]\n${rows.length ? rows.join("\n\n") : "未检索到足以支持该槽位的正文证据。"}`;
}

function groundingRules(question: string, slots: EvidenceSlot[]) {
  const rules = [
    `[Answer Grounding ${EVIDENCE_COMPOSER_VERSION}]`,
    "你正在执行证据约束回答。只能使用下方“证据槽位”中的正文事实作答；不要依赖工作区再次检索到的其他内容，也不要用常识补全缺失事实。",
    "<document_metadata> 中的 published 可能是知识库导入时间，不得作为文章发布日期或活动日期。文章发布日期只能使用证据块中单独标出的“文章发布日期”或正文明确的原创发布日期。",
    "URL 必须和同一证据块中的标题绑定，禁止把一篇文章的 URL 复用给另一篇文章。",
    "如果某个被问到的字段或目标没有明确正文证据，写“文档未明确说明”，不要猜测。",
    "回答应覆盖问题要求的每个目标/字段；有多个证据槽位时逐槽检查后再回答，不能因为前几个槽位信息充分就遗漏后面的槽位。",
  ];
  if (isTemporal(question)) {
    rules.push("时效判断只能比较正文中明确给出的活动日期、展期、截止日期或结束日期与用户给定基准日期；绝不能根据文章发布日期、季节、活动名称或“通常情况”推断活动是否结束。若明确给出日期区间，则使用区间结束日期判断。 ");
  }
  if (isSafety(question)) {
    rules.push("安全汇总应保留正文中的具体风险点，例如天气、高温、电池/充电、诈骗等；不要只概括成“注意安全”。");
  }
  if (slots.some((slot) => slot.target)) {
    rules.push("对于用户逐项列出的目标，必须按相同顺序分别回答，并优先使用与该目标标题/正文直接匹配的证据槽位。 ");
  }
  return rules.join("\n");
}

export async function composeEvidenceBundle(
  workspace: string,
  question: string,
  plan: RetrievalPlan,
  results: Citation[],
): Promise<EvidenceBundle> {
  const slots = buildSlots(question, plan.intent);
  const slotRows: SlotEvidence[] = [];
  const warnings: string[] = [];

  for (const slot of slots) {
    const gathered = await gatherSlotEvidence(workspace, slot, results, plan.threshold);
    warnings.push(...gathered.warnings.map((warning) => `${slot.label}: ${warning}`));
    slotRows.push({ slot, citations: gathered.citations });
  }

  const citations = dedupe(slotRows.flatMap((row) => row.citations));
  const header = groundingRules(question, slots);
  const prompt = `${header}\n${slotRows.map((row) => evidenceBlock(row, false)).join("\n")}`.slice(0, 12000);
  const compactPrompt = `${header}\n${slotRows.map((row) => evidenceBlock(row, true)).join("\n")}`.slice(0, 6200);

  return {
    version: EVIDENCE_COMPOSER_VERSION,
    prompt,
    compactPrompt,
    citations,
    slots: slotRows.map((row) => ({ id: row.slot.id, label: row.slot.label, target: row.slot.target, evidenceCount: row.citations.length })),
    warning: warnings.length ? warnings.join(" | ") : undefined,
  };
}
