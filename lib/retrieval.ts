import { Citation, vectorSearchAnythingLLM } from "@/lib/anythingllm";

export type RetrievalIntent = "single" | "aggregate" | "source-filtered";

export type EnhancedCitation = Citation & {
  rrfScore?: number;
  queryHits?: number;
  relevanceScore?: number;
  evidenceOrigin?: "anythingllm" | "retrieval2";
};

export type RetrievalPlan = {
  intent: RetrievalIntent;
  sourceHint?: string;
  queries: string[];
  topN: number;
  perQueryTopN: number;
  threshold: number;
};

export type EnhancedRetrieval = {
  plan: RetrievalPlan;
  results: EnhancedCitation[];
  warning?: string;
};

function compact(value: string) {
  return value.replace(/\s+/g, " ").trim();
}

function unique(values: string[]) {
  return values.map(compact).filter(Boolean).filter((value, index, list) => list.indexOf(value) === index);
}

function detectSourceHint(question: string) {
  const chinesePatterns = [
    /(?:只|仅)?(?:列出|给出|显示|查找|查询)?\s*([^，。！？]{2,42}?)(?:发布的|发布之|公众号发布的)(?:培训|活动|文章|信息|内容)/,
    /(?:来自|来源于)\s*([^，。！？]{2,42}?)(?:的|所发布的)(?:培训|活动|文章|信息|内容)/,
  ];
  for (const pattern of chinesePatterns) {
    const match = question.match(pattern);
    if (match?.[1]) return compact(match[1].replace(/^(?:只|仅)/, ""));
  }

  const english = question.match(/(?:published by|from)\s+([^?.!,]{3,60}?)(?:\s+(?:about|on|for)\b|[?.!,]|$)/i);
  return english?.[1] ? compact(english[1]) : undefined;
}

function isAggregateQuestion(question: string) {
  return /(有哪些|哪些|列出|汇总|全部|所有|哪几|分别|当前测试库中|当前知识库中|参与机会|相关信息)/.test(question)
    || /\b(list|which|all|available|opportunities|what\s+(?:activities|events|training|information))\b/i.test(question);
}

function queryCore(question: string, sourceHint?: string) {
  let core = question
    .replace(/[？?。！!]/g, " ")
    .replace(/^(?:请|当前测试库中|当前知识库中|测试库中|知识库中)/, "")
    .replace(/(?:有哪些|哪些|只列出|仅列出|列出|汇总|给出)/g, " ")
    .replace(/(?:发布的|相关的|相关信息|信息)/g, " ");
  if (sourceHint) core = core.replace(sourceHint, " ");
  return compact(core);
}

function domainQueries(question: string, sourceHint?: string) {
  const prefix = sourceHint ? `${sourceHint} ` : "";
  const rows: string[] = [];
  if (/(培训|training|workshop|文献综述|zotero)/i.test(question)) {
    rows.push(`${prefix}培训 training workshop Zotero 文献管理 文献综述`);
  }
  if (/(安全|safety|诈骗|消防|台风|高温|健康)/i.test(question)) {
    rows.push(`${prefix}学生 安全 健康 防诈骗 消防 极端天气 台风 高温`);
  }
  if (/(活动|机会|参与|报名|event|opportunit)/i.test(question)) {
    rows.push(`${prefix}学生 活动 参与 机会 报名 夏令营 招募 招新`);
  }
  if (/(书评|大赛|比赛|竞赛|机会|参与)/i.test(question)) {
    rows.push(`${prefix}学生 书评大赛 比赛 竞赛 参与`);
  }
  if (/(图书馆|library)/i.test(question)) rows.push(`${prefix}图书馆 library`);
  if (/\bSDG\b|可持续/i.test(question)) rows.push(`${prefix}SDG 可持续发展 优质教育 负责任消费 生产`);
  return rows;
}

export function buildRetrievalPlan(question: string, options?: { topN?: number; threshold?: number }): RetrievalPlan {
  const cleanQuestion = compact(question);
  const sourceHint = detectSourceHint(cleanQuestion);
  const aggregate = isAggregateQuestion(cleanQuestion);
  const intent: RetrievalIntent = sourceHint ? "source-filtered" : aggregate ? "aggregate" : "single";
  const defaultTopN = intent === "single" ? 6 : intent === "aggregate" ? 12 : 10;
  const topN = Math.max(1, Math.min(12, options?.topN ?? defaultTopN));
  const threshold = options?.threshold ?? 0.2;

  if (intent === "single") {
    return { intent, sourceHint, queries: [cleanQuestion], topN, perQueryTopN: topN, threshold };
  }

  const core = queryCore(cleanQuestion, sourceHint);
  const queries = unique([
    cleanQuestion,
    sourceHint && core ? `${sourceHint} ${core}` : core,
    ...domainQueries(cleanQuestion, sourceHint),
  ]).slice(0, 5);

  return {
    intent,
    sourceHint,
    queries: queries.length ? queries : [cleanQuestion],
    topN,
    perQueryTopN: Math.max(8, Math.min(12, topN)),
    threshold,
  };
}

function citationKey(item: Citation) {
  if (item.url) return `url:${item.url}`;
  return `title:${String(item.title || "").replace(/\.md$/i, "").replace(/\s+/g, "").toLocaleLowerCase()}`;
}

function sourceMatches(item: Citation, sourceHint: string) {
  const corpus = [item.source, item.title, item.text].filter(Boolean).join("\n").toLocaleLowerCase();
  return corpus.includes(sourceHint.toLocaleLowerCase());
}

function relevanceTerms(question: string) {
  const rows: string[] = [];
  if (/(培训|training|workshop|文献综述|zotero)/i.test(question)) rows.push("培训", "training", "workshop", "zotero", "文献综述");
  if (/(活动|机会|参与|报名|event|opportunit)/i.test(question)) rows.push("活动", "机会", "报名", "夏令营", "书评", "大赛", "比赛", "竞赛", "招募", "招新", "event");
  if (/(安全|safety|诈骗|消防|台风|高温|健康)/i.test(question)) rows.push("安全", "诈骗", "消防", "台风", "高温", "健康", "safety");
  if (/(图书馆|library)/i.test(question)) rows.push("图书馆", "library");
  if (/\bSDG\b|可持续/i.test(question)) rows.push("sdg", "可持续", "环保", "教育");
  return unique(rows.map((item) => item.toLocaleLowerCase()));
}

function lexicalRelevance(item: Citation, question: string) {
  const terms = relevanceTerms(question);
  if (!terms.length) return 0;
  const title = String(item.title || "").toLocaleLowerCase();
  const source = String(item.source || "").toLocaleLowerCase();
  const text = String(item.text || "").slice(0, 1800).toLocaleLowerCase();
  return terms.reduce((score, term) => score + (title.includes(term) ? 4 : 0) + (source.includes(term) ? 2 : 0) + (text.includes(term) ? 1 : 0), 0);
}

export async function enhancedVectorSearch(
  workspace: string,
  question: string,
  options?: { topN?: number; threshold?: number },
): Promise<EnhancedRetrieval> {
  const plan = buildRetrievalPlan(question, options);
  const merged = new Map<string, EnhancedCitation>();
  const warnings: string[] = [];

  for (const query of plan.queries) {
    try {
      const rows = await vectorSearchAnythingLLM(workspace, query, plan.perQueryTopN, plan.threshold);
      rows.forEach((row, index) => {
        const key = citationKey(row);
        const contribution = 1 / (60 + index + 1);
        const existing = merged.get(key);
        if (existing) {
          existing.rrfScore = (existing.rrfScore || 0) + contribution;
          existing.queryHits = (existing.queryHits || 1) + 1;
          if (!existing.text && row.text) existing.text = row.text;
          if (!existing.url && row.url) existing.url = row.url;
          if (!existing.source && row.source) existing.source = row.source;
          if (!existing.publishedDate && row.publishedDate) existing.publishedDate = row.publishedDate;
          if (typeof row.score === "number" && (typeof existing.score !== "number" || row.score > existing.score)) existing.score = row.score;
        } else {
          merged.set(key, { ...row, rrfScore: contribution, queryHits: 1 });
        }
      });
    } catch (error) {
      warnings.push(`${query}: ${error instanceof Error ? error.message : "vector search failed"}`);
    }
  }

  let ranked = [...merged.values()].map((item) => ({ ...item, relevanceScore: lexicalRelevance(item, question) })).sort((a, b) => {
    const sourceBoostA = plan.sourceHint && sourceMatches(a, plan.sourceHint) ? 1 : 0;
    const sourceBoostB = plan.sourceHint && sourceMatches(b, plan.sourceHint) ? 1 : 0;
    if (sourceBoostA !== sourceBoostB) return sourceBoostB - sourceBoostA;
    if ((a.relevanceScore || 0) !== (b.relevanceScore || 0)) return (b.relevanceScore || 0) - (a.relevanceScore || 0);
    if ((a.queryHits || 0) !== (b.queryHits || 0)) return (b.queryHits || 0) - (a.queryHits || 0);
    return (b.rrfScore || 0) - (a.rrfScore || 0);
  });

  if (plan.sourceHint) {
    const sourceOnly = ranked.filter((row) => sourceMatches(row, plan.sourceHint!));
    if (sourceOnly.length) ranked = sourceOnly;
  }

  return {
    plan,
    results: ranked.slice(0, plan.topN),
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

export function groundingEvidence(plan: RetrievalPlan, results: Citation[]) {
  const limit = plan.intent === "single" ? 5 : plan.intent === "source-filtered" ? 6 : 8;
  return results.slice(0, limit);
}

export function mergeGroundingCitations(primary: Citation[], plan: RetrievalPlan, results: Citation[]) {
  const primaryRows = plan.sourceHint ? primary.filter((item) => sourceMatches(item, plan.sourceHint!)) : primary;
  const rows: EnhancedCitation[] = [
    ...groundingEvidence(plan, results).map((item) => ({ ...item, evidenceOrigin: "retrieval2" as const })),
    ...primaryRows.map((item) => ({ ...item, evidenceOrigin: "anythingllm" as const })),
  ];
  const seen = new Set<string>();
  return rows.filter((item) => {
    const key = citationKey(item);
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

export function retrievalPromptHint(plan: RetrievalPlan, results: Citation[], options?: { compact?: boolean }) {
  const compactMode = Boolean(options?.compact);
  const lines = [
    "[检索与元数据规则]",
    "AnythingLLM 检索片段中的 <document_metadata> published 可能是文档进入知识库的时间，不得把它直接当作公众号文章发布日期。若需要文章发布日期，优先使用下方证据中的‘文章发布日期’或正文开头‘原创/发布’行中的日期；两者冲突时明确指出冲突。",
    "下方是 Retrieval 2.1 实际召回的补充证据。可以使用其中明确出现的标题、来源、文章发布日期、原文链接和摘录；不得凭标题补写未出现的事实。",
    "原文链接必须逐篇精确复制对应证据中的 URL。若某篇证据没有 URL，就写‘文档未明确说明’，绝对不得复用另一篇文章的链接。",
  ];

  if (plan.intent === "source-filtered") {
    lines.push(`用户明确限定来源为“${plan.sourceHint}”。回答只能使用该来源发布的文档；其他来源即使相关也不得替代。`);
  } else if (plan.intent === "aggregate") {
    lines.push("这是列表/汇总型问题。不要因为检索到一篇相关文档就断言只有一项；应尽量覆盖所有直接相关且有证据的候选。只列出与问题直接相关的证据，不要为了凑数量加入边缘内容。回答保持精炼，优先列标题、来源、发布日期和原文链接，不写大段背景介绍。");
  }

  const normalLimit = plan.intent === "single" ? 5 : 6;
  const limit = compactMode ? Math.min(5, normalLimit) : normalLimit;
  const excerptLimit = compactMode ? 0 : plan.intent === "aggregate" ? 320 : plan.intent === "source-filtered" ? 420 : 480;

  results.slice(0, limit).forEach((item, index) => {
    const title = String(item.title || "Knowledge-base source").replace(/\.md$/i, "");
    const excerpt = excerptLimit ? cleanEvidenceText(item.text).slice(0, excerptLimit) : "";
    lines.push(`\n[证据 ${index + 1}]`);
    lines.push(`标题: ${title}`);
    if (item.source) lines.push(`来源: ${item.source}`);
    if (item.publishedDate) lines.push(`文章发布日期: ${item.publishedDate}`);
    lines.push(`原文链接: ${item.url || "文档未明确说明"}`);
    if (excerpt) lines.push(`摘录: ${excerpt}`);
  });

  return `${lines.join("\n")}\n`;
}
