import { Citation, vectorSearchAnythingLLM } from "@/lib/anythingllm";

export type RetrievalIntent = "single" | "aggregate" | "source-filtered" | "document-detail";

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

function isDocumentDetailQuestion(question: string) {
  if (/(当前测试库中|当前知识库中|测试库中有哪些|知识库中有哪些|哪些文章|哪些活动|列出所有|汇总所有)/.test(question)) return false;
  return /(关键信息|关键内容|包含哪些|包括哪些|方案.*(?:内容|流程|安排|要求)|通知.*(?:内容|要求|安排)|指南.*(?:内容|要求)|规则.*(?:内容|要求)|what\s+(?:are\s+)?(?:the\s+)?(?:key\s+)?details|key information)/i.test(question);
}

function isAggregateQuestion(question: string) {
  return /(有哪些|哪些|列出|汇总|全部|所有|哪几|分别|当前测试库中|当前知识库中|参与机会|相关信息)/.test(question)
    || /\b(list|which|all|available|opportunities|what\s+(?:activities|events|training|information))\b/i.test(question);
}

function isTemporalQuestion(question: string) {
  return /(近期|最近|之前|以后|已经结束|已结束|过期|失效|有效|可参加|还能参加|报名|截止|日期|时间|upcoming|recent|expired|ended|deadline|still\s+open|validity)/i.test(question);
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

function temporalQueryRows(question: string, prefix: string) {
  if (!isTemporalQuestion(question)) return [];
  const rows = [
    `${prefix}活动 日期 时间 开始 结束 报名截止 截止日期 展览时间 会议时间`,
    `${prefix}活动 会议 展览 夏令营 报名 截止 结束`,
  ];
  const boundary = question.match(/(20\d{2})年\s*(\d{1,2})月(?:\s*(\d{1,2})日)?/);
  if (boundary) rows.push(`${prefix}${boundary[1]}年 ${boundary[2]}月 活动 日期 截止 结束 报名`);
  return rows;
}

function domainQueries(question: string, sourceHint?: string) {
  const prefix = sourceHint ? `${sourceHint} ` : "";
  const rows: string[] = [];
  if (/(培训|training|workshop|文献综述|zotero)/i.test(question)) {
    rows.push(`${prefix}培训 training workshop Zotero 文献管理 文献综述`);
  }
  if (/(安全|safety|诈骗|消防|台风|高温|健康)/i.test(question)) {
    rows.push(`${prefix}学生 安全 健康 防诈骗 网络诈骗 消防 充电宝 极端天气 台风 高温`);
  }
  if (/(活动|机会|参与|报名|event|opportunit)/i.test(question)) {
    rows.push(`${prefix}学生 活动 参与 机会 报名 夏令营 招募 招新`);
  }
  if (/(书评|大赛|比赛|竞赛|机会|参与)/i.test(question)) {
    rows.push(`${prefix}学生 书评大赛 比赛 竞赛 参与`);
  }
  if (/(关键信息|关键内容|方案|通知|指南|规则|流程|安排)/i.test(question)) {
    rows.push(`${prefix}时间 日期 截止 流程 对象 资格 条件 申请 报名 注意事项 联系方式`);
  }
  if (/(图书馆|library)/i.test(question)) rows.push(`${prefix}图书馆 library`);
  if (/\bSDG\b|可持续/i.test(question)) {
    rows.push(`${prefix}SDG 可持续发展 优质教育 学习 培训 负责任消费 生产 环保 资源利用`);
  }
  rows.push(...temporalQueryRows(question, prefix));
  return rows;
}

export function buildRetrievalPlan(question: string, options?: { topN?: number; threshold?: number }): RetrievalPlan {
  const cleanQuestion = compact(question);
  const sourceHint = detectSourceHint(cleanQuestion);
  const documentDetail = isDocumentDetailQuestion(cleanQuestion);
  const aggregate = isAggregateQuestion(cleanQuestion);
  const intent: RetrievalIntent = sourceHint ? "source-filtered" : documentDetail ? "document-detail" : aggregate ? "aggregate" : "single";
  const defaultTopN = intent === "single" ? 6 : intent === "document-detail" ? 8 : intent === "aggregate" ? 12 : 10;
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
  ]).slice(0, intent === "document-detail" ? 4 : 6);

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
  if (/(安全|safety|诈骗|消防|台风|高温|健康)/i.test(question)) rows.push("安全", "诈骗", "网络诈骗", "消防", "充电宝", "台风", "极端天气", "高温", "健康", "safety");
  if (/(关键信息|关键内容|方案|通知|指南|规则|流程|安排)/i.test(question)) rows.push("时间", "日期", "截止", "流程", "对象", "资格", "条件", "申请", "报名", "注意事项", "联系方式");
  if (isTemporalQuestion(question)) rows.push("活动", "日期", "时间", "开始", "结束", "截止", "报名", "会议", "展览", "夏令营", "年会");
  if (/(图书馆|library)/i.test(question)) rows.push("图书馆", "library");
  if (/\bSDG\b|可持续/i.test(question)) rows.push("sdg", "可持续", "环保", "教育", "学习", "消费", "生产", "资源");
  return unique(rows.map((item) => item.toLocaleLowerCase()));
}

function lexicalRelevance(item: Citation, question: string) {
  const terms = relevanceTerms(question);
  if (!terms.length) return 0;
  const title = String(item.title || "").toLocaleLowerCase();
  const source = String(item.source || "").toLocaleLowerCase();
  const text = String(item.text || "").slice(0, 4000).toLocaleLowerCase();
  return terms.reduce((score, term) => score + (title.includes(term) ? 4 : 0) + (source.includes(term) ? 2 : 0) + (text.includes(term) ? 1 : 0), 0);
}

function mergeChunkText(existing: string | undefined, incoming: string | undefined) {
  if (!incoming) return existing;
  if (!existing) return incoming;
  const a = compact(existing);
  const b = compact(incoming);
  if (!b || a.includes(b)) return existing;
  if (b.includes(a)) return incoming;
  return `${existing}\n\n<retrieval_chunk>\n${incoming}`.slice(0, 14000);
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
          existing.text = mergeChunkText(existing.text, row.text);
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

function selectEvidenceExcerpt(value: string | undefined, question: string, limit: number) {
  if (!value || limit <= 0) return "";
  const terms = relevanceTerms(question);
  const chunks = String(value)
    .split(/<retrieval_chunk>/i)
    .map((chunk) => cleanEvidenceText(chunk))
    .filter(Boolean)
    .map((chunk, index) => ({
      chunk,
      index,
      score: terms.reduce((score, term) => score + (chunk.toLocaleLowerCase().includes(term) ? 1 : 0), 0),
    }))
    .sort((a, b) => b.score - a.score || a.index - b.index);
  if (!chunks.length) return "";
  const count = Math.min(2, chunks.length);
  const perChunk = Math.max(120, Math.floor(limit / count));
  return chunks.slice(0, count).map((item) => item.chunk.slice(0, perChunk)).join(" … ").slice(0, limit);
}

export function groundingEvidence(plan: RetrievalPlan, results: Citation[]) {
  const limit = plan.intent === "single" ? 5 : plan.intent === "document-detail" ? 5 : plan.intent === "source-filtered" ? 6 : 8;
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
  const originalQuestion = plan.queries[0] || "";
  const lines = [
    "[检索与元数据规则]",
    "默认使用用户提问所使用的语言回答；除非用户明确要求切换语言。英文提问应优先用英文回答，中文提问应优先用中文回答。",
    "AnythingLLM 检索片段中的 <document_metadata> published 可能是文档进入知识库的时间，不得把它直接当作公众号文章发布日期。若需要文章发布日期，优先使用下方证据中的‘文章发布日期’或正文开头‘原创/发布’行中的日期；两者冲突时明确指出冲突。",
    "下方是 Retrieval 2.2 实际召回的补充证据。可以使用其中明确出现的标题、来源、文章发布日期、原文链接和摘录；不得凭标题补写未出现的事实。",
    "原文链接必须逐篇精确复制对应证据中的 URL。若某篇证据没有 URL，就写‘文档未明确说明’，绝对不得复用另一篇文章的链接。",
  ];

  if (plan.intent === "source-filtered") {
    lines.push(`用户明确限定来源为“${plan.sourceHint}”。回答只能使用该来源发布的文档；其他来源即使相关也不得替代。`);
  } else if (plan.intent === "document-detail") {
    lines.push("这是单篇文档详情抽取问题。应整合同一文档的多个召回片段，优先回答对象/资格、日期/时间、流程、截止、地点、联系方式和注意事项等用户要求的关键字段；不要只根据某一个局部片段作答。缺失字段明确写‘文档未明确说明’。");
  } else if (plan.intent === "aggregate") {
    lines.push("这是列表/汇总型问题。不要因为检索到一篇相关文档就断言只有一项；应尽量覆盖所有直接相关且有证据的候选。只列出与问题直接相关的证据，不要为了凑数量加入边缘内容。");
    if (/(提醒|关键信息|关键内容|说明证据|依据|原因|为什么|主要解决|safety|key information|evidence|why)/i.test(originalQuestion)) {
      lines.push("用户要求的是内容或证据，而不只是文章目录。每一项都应补充一条简短的关键信息/原文证据；不要只输出标题、来源、日期和链接。所有证据必须来自召回摘录。 ");
    } else {
      lines.push("回答保持精炼，优先列标题、来源、发布日期和原文链接；只有用户问题需要时再补充简短内容。 ");
    }
  }

  if (isTemporalQuestion(originalQuestion)) {
    lines.push("这是日期/时效性问题。优先使用明确写出的活动日期、会议日期、展览时间、报名截止或结束日期。最终主列表只列能够用明确日期支持判断的项目；仅有文章发布日期或日期不明的项目不要混入主列表，可在末尾简短说明‘其他候选缺少明确活动/截止日期，无法判断’。 ");
  }

  if (/\bSDG\b|可持续/i.test(originalQuestion)) {
    lines.push("若用户要求 SDG 建议分类，每个标签都必须附一条具体行动、项目、政策、研究、服务或可验证成果作为直接证据。不得仅因为文章出现‘教育’‘创新’‘可持续’等宽泛词就推断 SDG；证据不足时不要标记。优先说明建议分类而非宣称原文已有标签。 ");
  }

  const normalLimit = plan.intent === "single" ? 5 : plan.intent === "document-detail" ? 5 : 6;
  const limit = compactMode ? Math.min(5, normalLimit) : normalLimit;
  const excerptLimit = compactMode ? 0 : plan.intent === "aggregate" ? 400 : plan.intent === "source-filtered" ? 460 : plan.intent === "document-detail" ? 700 : 520;

  results.slice(0, limit).forEach((item, index) => {
    const title = String(item.title || "Knowledge-base source").replace(/\.md$/i, "");
    const excerpt = excerptLimit ? selectEvidenceExcerpt(item.text, originalQuestion, excerptLimit) : "";
    lines.push(`\n[证据 ${index + 1}]`);
    lines.push(`标题: ${title}`);
    if (item.source) lines.push(`来源: ${item.source}`);
    if (item.publishedDate) lines.push(`文章发布日期: ${item.publishedDate}`);
    lines.push(`原文链接: ${item.url || "文档未明确说明"}`);
    if (excerpt) lines.push(`摘录: ${excerpt}`);
  });

  return `${lines.join("\n")}\n`;
}
