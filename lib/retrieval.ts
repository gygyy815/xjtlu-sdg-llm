import { Citation, vectorSearchAnythingLLM } from "@/lib/anythingllm";

export type RetrievalIntent = "single" | "aggregate" | "source-filtered";

export type EnhancedCitation = Citation & {
  rrfScore?: number;
  queryHits?: number;
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
    rows.push(`${prefix}培训`, `${prefix}training workshop 文献管理 文献综述`);
  }
  if (/(安全|safety|诈骗|消防|台风|高温|健康)/i.test(question)) {
    rows.push(`${prefix}学生 安全 健康`, `${prefix}防诈骗 消防 极端天气 台风 高温`);
  }
  if (/(活动|机会|参与|报名|event|opportunit)/i.test(question)) {
    rows.push(`${prefix}学生 活动 参与 机会 报名`, `${prefix}培训 夏令营 比赛 活动`);
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
  const topN = Math.max(1, Math.min(12, options?.topN ?? (intent === "single" ? 6 : 10)));
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
    perQueryTopN: Math.max(6, Math.min(10, topN)),
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

  let ranked = [...merged.values()].sort((a, b) => {
    const sourceBoostA = plan.sourceHint && sourceMatches(a, plan.sourceHint) ? 1 : 0;
    const sourceBoostB = plan.sourceHint && sourceMatches(b, plan.sourceHint) ? 1 : 0;
    if (sourceBoostA !== sourceBoostB) return sourceBoostB - sourceBoostA;
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

export function retrievalPromptHint(plan: RetrievalPlan, results: Citation[]) {
  const lines = [
    "[检索与元数据规则]",
    "AnythingLLM 检索片段中的 <document_metadata> published 可能是文档进入知识库的时间，不得把它直接当作公众号文章发布日期。若需要文章发布日期，优先使用下方索引日期或正文开头‘原创/发布’行中的日期；两者冲突时明确指出冲突。",
  ];

  if (plan.intent === "source-filtered") {
    lines.push(`用户明确限定来源为“${plan.sourceHint}”。回答只能使用该来源发布的文档；其他来源即使相关也不得替代。`);
  } else if (plan.intent === "aggregate") {
    lines.push("这是列表/汇总型问题。不要因为检索到一篇相关文档就断言只有一项；应尽量覆盖所有直接相关且有证据的候选。");
  }

  lines.push("下面是补充检索得到的候选文档索引信息。它们只是检索线索，仍必须以实际文档内容为依据，不得仅凭标题猜测：");
  const limit = plan.intent === "single" ? 5 : 8;
  results.slice(0, limit).forEach((item, index) => {
    const date = item.publishedDate ? ` · 文章发布日期 ${item.publishedDate}` : "";
    lines.push(`${index + 1}. ${String(item.title || "Knowledge-base source").replace(/\.md$/i, "")}${item.source ? ` · ${item.source}` : ""}${date}`);
  });
  return `${lines.join("\n")}\n`;
}
