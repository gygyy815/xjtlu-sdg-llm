import { NextResponse } from "next/server";
import { askAnythingLLM, workspaceMap } from "@/lib/anythingllm";

type RawGraphNode = {
  id?: unknown;
  label?: unknown;
  type?: unknown;
  sourceIndex?: unknown;
  detail?: unknown;
};

type RawGraphEdge = {
  source?: unknown;
  target?: unknown;
  label?: unknown;
};

type RawGraph = {
  title?: unknown;
  summary?: unknown;
  nodes?: unknown;
  edges?: unknown;
};

const allowedTypes = new Set(["article", "activity", "department", "audience", "location", "time"]);

function safeJson(text: string): RawGraph {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("模型没有返回可解析的知识图谱 JSON。");
  return JSON.parse(match[0]) as RawGraph;
}

function normalizeGraph(raw: RawGraph, citations: Awaited<ReturnType<typeof askAnythingLLM>>["citations"]) {
  const rawNodes = Array.isArray(raw.nodes) ? (raw.nodes as RawGraphNode[]) : [];
  const nodes = rawNodes
    .map((node, index) => {
      const type = typeof node.type === "string" && allowedTypes.has(node.type) ? node.type : null;
      const label = typeof node.label === "string" ? node.label.trim() : "";
      if (!type || !label) return null;

      const requestedSourceIndex = Number(node.sourceIndex);
      const sourceIndex = Number.isInteger(requestedSourceIndex) && requestedSourceIndex > 0 && requestedSourceIndex <= citations.length
        ? requestedSourceIndex
        : undefined;
      const citation = sourceIndex ? citations[sourceIndex - 1] : undefined;

      return {
        id: typeof node.id === "string" && node.id.trim() ? node.id.trim() : `n${index + 1}`,
        label: label.slice(0, 120),
        type,
        sourceIndex,
        detail: typeof node.detail === "string" ? node.detail.trim().slice(0, 320) : undefined,
        sourceTitle: citation?.title,
        sourceUrl: citation?.url,
        sourceName: citation?.source,
        publishedDate: citation?.publishedDate,
        sourceText: citation?.text?.slice(0, 500),
      };
    })
    .filter((node): node is NonNullable<typeof node> => Boolean(node))
    .slice(0, 24);

  const ids = new Set(nodes.map((node) => node.id));
  const rawEdges = Array.isArray(raw.edges) ? (raw.edges as RawGraphEdge[]) : [];
  const edges = rawEdges
    .map((edge) => ({
      source: typeof edge.source === "string" ? edge.source : "",
      target: typeof edge.target === "string" ? edge.target : "",
      label: typeof edge.label === "string" ? edge.label.trim().slice(0, 40) : "相关",
    }))
    .filter((edge) => edge.source && edge.target && edge.source !== edge.target && ids.has(edge.source) && ids.has(edge.target))
    .slice(0, 45);

  return {
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 100) : "校园知识关系图",
    summary: typeof raw.summary === "string" ? raw.summary.trim().slice(0, 500) : "图谱仅展示本次检索证据中可核查的实体关系。",
    nodes,
    edges,
  };
}

export async function POST(request: Request) {
  try {
    const { message, account, sessionId } = await request.json();
    const slug = workspaceMap()[account];
    if (!message?.trim()) return NextResponse.json({ error: "请输入要生成图谱的主题。" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "该知识库尚未配置 Workspace。" }, { status: 400 });

    // First pass: let the selected AnythingLLM workspace perform the real RAG retrieval.
    const result = await askAnythingLLM(slug, message, "query", sessionId);
    const sourceList = result.citations.slice(0, 8).map((citation, index) => ({
      index: index + 1,
      title: citation.title,
      source: citation.source,
      publishedDate: citation.publishedDate,
      text: citation.text?.slice(0, 900),
    }));

    const prompt = `
你正在为 XJTLU 校园知识库生成可核查的知识关系图。
用户主题：${message}

下面是本次 RAG 已检索到的来源摘要。只允许从这些证据中抽取实体和关系：
${JSON.stringify(sourceList)}

只允许创建以下节点类型：
- article：本次检索到的来源文章
- activity：明确的活动、项目、讲座、工作坊、比赛或可参与事项
- department：明确的部门、学院、组织或负责单位
- audience：明确参与对象
- location：明确地点
- time：明确活动日期、时间或截止日期

禁止创建：人物、电话号码、邮箱、泛化主题、SDG、推测实体。

要求：
1. 每个 article 节点必须使用对应来源标题，sourceIndex 必须是来源编号。
2. 非 article 节点如能追溯到某一篇来源，也填写 sourceIndex。
3. 只有原文明确支持的关系才可建立；不确定就省略。
4. 优先围绕 activity 建图，减少孤立节点。
5. 节点总数不超过 24，关系不超过 45。
6. detail 用一句简短说明解释该节点在文章中的含义，不能添加新事实。
7. 返回 ONLY 一个合法 JSON 对象，不要 Markdown，不要解释。

JSON schema:
{
  "title": "简短图谱标题",
  "summary": "1-2句说明图谱展示范围和证据限制",
  "nodes": [
    {"id":"n1","label":"实体名称","type":"article|activity|department|audience|location|time","sourceIndex":1,"detail":"简短证据说明"}
  ],
  "edges": [
    {"source":"n1","target":"n2","label":"来源于|举办|负责|面向|位于|发生于|截止于"}
  ]
}`;

    // Second pass: extract a strict graph from the already-retrieved evidence.
    const graphResponse = await askAnythingLLM(slug, prompt, "query", sessionId);
    const graph = normalizeGraph(safeJson(graphResponse.text), result.citations);
    return NextResponse.json({ graph, citations: result.citations });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "知识图谱生成失败。" }, { status: 500 });
  }
}
