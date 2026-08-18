import { NextResponse } from "next/server";
import { askAnythingLLM, resolveWorkspaceSlug } from "@/lib/anythingllm";

type RawNode = { id?: unknown; label?: unknown; detail?: unknown; level?: unknown; sourceIndex?: unknown };
type RawEdge = { source?: unknown; target?: unknown };
type RawMindMap = { title?: unknown; summary?: unknown; nodes?: unknown; edges?: unknown };

function parseJson(text: string): RawMindMap {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error("模型没有返回可解析的思维导图 JSON。");
  return JSON.parse(candidate) as RawMindMap;
}

function normalize(raw: RawMindMap, citationCount: number) {
  const rows = Array.isArray(raw.nodes) ? raw.nodes as RawNode[] : [];
  const nodes = rows
    .map((node, index) => {
      const label = typeof node.label === "string" ? node.label.trim().replace(/\s+/g, " ") : "";
      if (!label) return null;
      const requested = Number(node.sourceIndex);
      return {
        id: typeof node.id === "string" && node.id.trim() ? node.id.trim() : `n${index + 1}`,
        label: label.slice(0, 70),
        detail: typeof node.detail === "string" ? node.detail.trim().slice(0, 260) : "",
        level: Math.max(0, Math.min(4, Number.isFinite(Number(node.level)) ? Number(node.level) : 1)),
        sourceIndex: Number.isInteger(requested) && requested > 0 && requested <= citationCount ? requested : undefined,
      };
    })
    .filter((item): item is NonNullable<typeof item> => Boolean(item))
    .slice(0, 36);

  if (!nodes.length) throw new Error("没有生成有效的思维导图节点。");
  const ids = new Set(nodes.map((node) => node.id));
  const rawEdges = Array.isArray(raw.edges) ? raw.edges as RawEdge[] : [];
  const seen = new Set<string>();
  const edges = rawEdges
    .map((edge) => ({ source: typeof edge.source === "string" ? edge.source : "", target: typeof edge.target === "string" ? edge.target : "" }))
    .filter((edge) => {
      if (!ids.has(edge.source) || !ids.has(edge.target) || edge.source === edge.target) return false;
      const key = `${edge.source}->${edge.target}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    })
    .slice(0, 42);

  const root = nodes.find((node) => node.level === 0) || nodes[0];
  root.level = 0;
  return {
    title: typeof raw.title === "string" && raw.title.trim() ? raw.title.trim().slice(0, 90) : root.label,
    summary: typeof raw.summary === "string" ? raw.summary.trim().slice(0, 360) : "仅基于当前知识库检索证据生成。",
    rootId: root.id,
    nodes,
    edges,
  };
}

export async function POST(request: Request) {
  try {
    const { message, account, workspaceSlug, sessionId } = await request.json();
    const topic = typeof message === "string" ? message.trim() : "";
    const slug = resolveWorkspaceSlug(account, workspaceSlug);
    if (!topic) return NextResponse.json({ error: "请输入思维导图主题。" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "当前知识库没有可用的 AnythingLLM Workspace。" }, { status: 400 });

    const prompt = `
用户主题：${topic}

请仅基于当前 Workspace 检索到的真实文档生成一份适合校园知识助手的思维导图。不要使用外部知识，不要猜测缺失事实。

要求：
1. 只返回一个合法 JSON 对象，不要 Markdown，不要解释文字。
2. 设置 1 个 level=0 的中心主题。
3. 一级分支优先使用真正有意义的类别，例如：核心信息、活动/服务、负责部门、时间、地点、参与对象、行动步骤、注意事项；不适用的类别不要硬加。
4. 节点文本尽量短，每个 label 最多约 20 个中文字符；长说明写入 detail。
5. 只保留文档明确支持的信息。日期、数字、人名、机构名不要改写。
6. sourceIndex 对应本次回答的引用来源序号；不能可靠判断时可以省略。
7. 节点不超过 30 个，层级不超过 4 层，避免重复节点。

JSON schema:
{"title":"标题","summary":"证据范围说明","nodes":[{"id":"n1","label":"中心主题","detail":"简短说明","level":0,"sourceIndex":1}],"edges":[{"source":"n1","target":"n2"}]}`;

    const result = await askAnythingLLM(slug, prompt, "query", sessionId);
    const citations = result.citations.slice(0, 10);
    const mindMap = normalize(parseJson(result.text), citations.length);
    return NextResponse.json({ mindMap, citations });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "思维导图生成失败。" }, { status: 500 });
  }
}
