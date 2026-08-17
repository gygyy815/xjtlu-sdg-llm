import { NextResponse } from "next/server";
import { askAnythingLLM, workspaceMap } from "@/lib/anythingllm";

type RawGraphNode = { id?: unknown; label?: unknown; type?: unknown; sourceIndex?: unknown; detail?: unknown };
type RawGraphEdge = { source?: unknown; target?: unknown; label?: unknown };
type RawGraph = { title?: unknown; summary?: unknown; nodes?: unknown; edges?: unknown };

const allowedTypes = new Set(["article", "activity", "department", "audience", "location", "time"]);

function safeJson(text: string): RawGraph {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("模型没有返回可解析的知识图谱 JSON。");
  return JSON.parse(match[0]) as RawGraph;
}

function cleanTitle(value: string) {
  return value
    .replace(/^@?\d{4}[^\s]*\s*/u, "")
    .replace(/\.md$/i, "")
    .replace(/^[-_\s]+|[-_\s]+$/g, "")
    .trim();
}

function normalizeGraph(raw: RawGraph, citations: Awaited<ReturnType<typeof askAnythingLLM>>["citations"]) {
  const rawNodes = Array.isArray(raw.nodes) ? (raw.nodes as RawGraphNode[]) : [];
  const nodes = rawNodes
    .map((node, index) => {
      const type = typeof node.type === "string" && allowedTypes.has(node.type) ? node.type : null;
      const originalLabel = typeof node.label === "string" ? node.label.trim() : "";
      if (!type || !originalLabel) return null;
      const requestedSourceIndex = Number(node.sourceIndex);
      const sourceIndex = Number.isInteger(requestedSourceIndex) && requestedSourceIndex > 0 && requestedSourceIndex <= citations.length ? requestedSourceIndex : undefined;
      const citation = sourceIndex ? citations[sourceIndex - 1] : undefined;
      const label = type === "article" && citation?.title ? cleanTitle(citation.title) : cleanTitle(originalLabel);
      return {
        id: typeof node.id === "string" && node.id.trim() ? node.id.trim() : `n${index + 1}`,
        label: label.slice(0, 100),
        type,
        sourceIndex,
        detail: typeof node.detail === "string" ? node.detail.trim().slice(0, 260) : undefined,
        sourceTitle: citation?.title,
        sourceUrl: citation?.url,
        sourceName: citation?.source,
        publishedDate: citation?.publishedDate,
        sourceText: citation?.text?.slice(0, 420),
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
      label: typeof edge.label === "string" ? edge.label.trim().slice(0, 30) : "相关",
    }))
    .filter((edge) => edge.source && edge.target && edge.source !== edge.target && ids.has(edge.source) && ids.has(edge.target))
    .slice(0, 45);

  return {
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 80) : "校园活动知识图谱",
    summary: typeof raw.summary === "string" ? raw.summary.trim().slice(0, 360) : "图谱仅展示本次检索证据中可核查的关系。",
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

    const retrievalPrompt = `
请检索与“${message}”最相关的校园知识库文章。若用户询问近期活动，请尽量覆盖 2-4 个不同活动，而不是只选择一篇文章。
优先返回能够明确确认活动名称、负责部门、参与对象、地点、活动日期/时间的信息。
不要把文章发布日期当作活动日期；没有明确活动事实的文章不要作为主要证据。
请仅根据知识库回答。`;

    const result = await askAnythingLLM(slug, retrievalPrompt, "query", sessionId);
    const sourceList = result.citations.slice(0, 8).map((citation, index) => ({
      index: index + 1,
      title: citation.title,
      source: citation.source,
      publishedDate: citation.publishedDate,
      text: citation.text?.slice(0, 1100),
    }));

    if (!sourceList.length) {
      return NextResponse.json({ error: "当前检索没有返回可用于构建图谱的来源文章。" }, { status: 422 });
    }

    const graphPrompt = `
你正在生成 XJTLU 校园活动知识图谱。用户主题：${message}
以下是 RAG 已检索到的来源证据：${JSON.stringify(sourceList)}

只允许节点类型：article、activity、department、audience、location、time。
禁止人物、电话号码、邮箱、泛化主题、SDG 和推测实体。

建图规则：
1. 每个明确活动创建一个 activity 节点，并优先让它成为局部中心。
2. 每个 activity 最多连接一个 article、一个 department、一个 audience、一个 location、一个 time；没有证据就省略。
3. article 节点的 sourceIndex 必须对应来源编号；其他节点也尽量填写 sourceIndex。
4. article 标签只写简洁文章标题，不要包含文件元数据、路径、@ 前缀或 .md。
5. time 只能是明确活动时间、日期或截止日期，不能用文章发布日期替代。
6. 尽量生成 2-4 个不同活动；若证据不足可以少于 2 个，但禁止编造。
7. 同义实体只保留一个节点；减少孤立节点与重复节点。
8. 关系标签仅用：来源于、举办、负责、面向、位于、发生于、截止于。
9. 返回 ONLY JSON。

JSON schema:
{"title":"简短标题","summary":"证据范围说明","nodes":[{"id":"n1","label":"实体","type":"article|activity|department|audience|location|time","sourceIndex":1,"detail":"一句证据说明"}],"edges":[{"source":"n1","target":"n2","label":"来源于|举办|负责|面向|位于|发生于|截止于"}]}`;

    const graphResponse = await askAnythingLLM(slug, graphPrompt, "query", sessionId);
    const graph = normalizeGraph(safeJson(graphResponse.text), result.citations);
    return NextResponse.json({ graph, citations: result.citations });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "知识图谱生成失败。" }, { status: 500 });
  }
}
