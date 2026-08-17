import { NextResponse } from "next/server";
import { askAnythingLLM, workspaceMap, type Citation } from "@/lib/anythingllm";

type RawGraphNode = { id?: unknown; label?: unknown; type?: unknown; detail?: unknown; sourceIndex?: unknown };
type RawGraphEdge = { source?: unknown; target?: unknown; label?: unknown };
type RawGraph = { title?: unknown; summary?: unknown; nodes?: unknown; edges?: unknown };

const allowedTypes = new Set(["article", "activity", "department", "audience", "location", "time"]);

function safeJson(text: string): RawGraph {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error("模型没有返回可解析的知识图谱 JSON。");
  return JSON.parse(candidate) as RawGraph;
}

function cleanTitle(value: string) {
  return value
    .replace(/^@?\d{4}[^\s]*\s*/u, "")
    .replace(/\.md$/i, "")
    .replace(/^[-_\s]+|[-_\s]+$/g, "")
    .trim();
}

function normalizeText(value: unknown) {
  return String(value || "")
    .replace(/\.md$/gi, "")
    .replace(/\s+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
}

function citationScore(node: { label: string; detail?: string; type: string }, citation: Citation) {
  const label = normalizeText(node.label);
  const detail = normalizeText(node.detail);
  const title = normalizeText(citation.title);
  const text = normalizeText(citation.text);
  let score = 0;

  if (label && title && (title.includes(label) || label.includes(title))) score += node.type === "article" ? 12 : 5;
  if (label && text.includes(label)) score += 8;
  if (detail && text.includes(detail.slice(0, Math.min(detail.length, 24)))) score += 3;

  // Chinese labels are often short; use overlapping 2-character fragments as a weak fallback.
  if (label.length >= 4 && text) {
    const fragments = new Set<string>();
    for (let i = 0; i < label.length - 1; i += 1) fragments.add(label.slice(i, i + 2));
    let overlap = 0;
    fragments.forEach((fragment) => { if (text.includes(fragment)) overlap += 1; });
    score += Math.min(overlap, 4);
  }
  return score;
}

function bestCitationIndex(node: { label: string; detail?: string; type: string }, citations: Citation[]) {
  let bestIndex: number | undefined;
  let bestScore = 0;
  citations.forEach((citation, index) => {
    const score = citationScore(node, citation);
    if (score > bestScore) {
      bestScore = score;
      bestIndex = index + 1;
    }
  });
  return bestScore >= 4 ? bestIndex : undefined;
}

function normalizeGraph(raw: RawGraph, citations: Citation[]) {
  const rawNodes = Array.isArray(raw.nodes) ? (raw.nodes as RawGraphNode[]) : [];
  const nodes = rawNodes
    .map((node, index) => {
      const type = typeof node.type === "string" && allowedTypes.has(node.type) ? node.type : null;
      const originalLabel = typeof node.label === "string" ? node.label.trim() : "";
      if (!type || !originalLabel) return null;

      const detail = typeof node.detail === "string" ? node.detail.trim().slice(0, 260) : undefined;
      const requested = Number(node.sourceIndex);
      const requestedSourceIndex = Number.isInteger(requested) && requested > 0 && requested <= citations.length ? requested : undefined;
      const sourceIndex = requestedSourceIndex || bestCitationIndex({ label: originalLabel, detail, type }, citations);
      const citation = sourceIndex ? citations[sourceIndex - 1] : undefined;
      const label = type === "article" && citation?.title ? cleanTitle(citation.title) : cleanTitle(originalLabel);

      return {
        id: typeof node.id === "string" && node.id.trim() ? node.id.trim() : `n${index + 1}`,
        label: label.slice(0, 100),
        type,
        sourceIndex,
        detail,
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
  const edgeKeys = new Set<string>();
  const edges = rawEdges
    .map((edge) => ({
      source: typeof edge.source === "string" ? edge.source : "",
      target: typeof edge.target === "string" ? edge.target : "",
      label: typeof edge.label === "string" ? edge.label.trim().slice(0, 30) : "相关",
    }))
    .filter((edge) => {
      if (!edge.source || !edge.target || edge.source === edge.target || !ids.has(edge.source) || !ids.has(edge.target)) return false;
      const key = `${edge.source}|${edge.target}|${edge.label}`;
      if (edgeKeys.has(key)) return false;
      edgeKeys.add(key);
      return true;
    })
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

    // One AnythingLLM request only. The previous two-pass implementation could
    // trigger a second long model request and surface provider-side 500
    // "Connection error" responses. Query mode still performs RAG retrieval,
    // while the same response also gives us the citations used by the answer.
    const graphPrompt = `
用户检索主题：${message}

请基于当前 AnythingLLM Workspace 检索到的真实文章，生成一个校园活动知识图谱。不要使用外部知识，也不要猜测。

只允许节点类型：
- activity：明确的活动、项目、讲座、工作坊、比赛或可参与事项
- department：明确负责/主办部门、学院或组织
- audience：明确参与对象
- location：明确活动地点
- time：明确活动日期、时间或报名截止时间
- article：作为活动来源依据的文章

严格规则：
1. activity 必须是中心实体；优先展示 1-4 个证据最完整的不同活动。
2. 每个 activity 仅在文档明确说明时连接 department、audience、location、time、article。
3. 禁止人物、电话、邮箱、SDG、泛化主题、推测实体。
4. 不得把文章发布日期当作活动日期。
5. article 的 label 使用简短文章标题，不要文件路径、元数据、@ 前缀或 .md。
6. detail 只能简述文档明确事实。
7. 关系标签仅使用：来源于、举办、负责、面向、位于、发生于、截止于。
8. 节点不超过 24，关系不超过 45，去除重复节点和孤立无意义节点。
9. sourceIndex 如无法从上下文可靠判断可以省略，后端会根据本次 citations 自动绑定来源。
10. 只返回一个合法 JSON 对象，不要 Markdown，不要解释文字。

JSON schema:
{"title":"简短图谱标题","summary":"1-2句证据范围说明","nodes":[{"id":"n1","label":"实体名称","type":"activity|department|audience|location|time|article","detail":"一句证据说明","sourceIndex":1}],"edges":[{"source":"n1","target":"n2","label":"来源于|举办|负责|面向|位于|发生于|截止于"}]}`;

    const result = await askAnythingLLM(slug, graphPrompt, "query", sessionId);
    const citations = result.citations.slice(0, 10);
    if (!result.text?.trim()) return NextResponse.json({ error: "AnythingLLM 未返回图谱内容，请重试。" }, { status: 502 });

    const graph = normalizeGraph(safeJson(result.text), citations);
    if (!graph.nodes.some((node) => node.type === "activity")) {
      return NextResponse.json({
        error: "本次检索没有提取到可核查的活动实体。请尝试指定时间范围、活动类型或选择更相关的知识库。",
        citations,
      }, { status: 422 });
    }

    return NextResponse.json({ graph, citations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "知识图谱生成失败。";
    const isConnectionError = /connection error|fetch failed|ECONN|ETIMEDOUT|socket/i.test(message);
    return NextResponse.json({
      error: isConnectionError
        ? "AnythingLLM 或其上游模型暂时连接失败。知识图谱已改为单次 RAG 调用，请稍后重试；若普通聊天也失败，请检查 AnythingLLM 的 Chat Provider/模型连接。"
        : message,
    }, { status: isConnectionError ? 502 : 500 });
  }
}
