import { NextResponse } from "next/server";
import { resolveWorkspaceSlug, vectorSearchAnythingLLM, type Citation } from "@/lib/anythingllm";

type GraphNode = {
  id: string;
  label: string;
  type: "article" | "activity" | "department" | "audience" | "location" | "time";
  sourceIndex?: number;
  detail?: string;
  sourceTitle?: string;
  sourceUrl?: string;
  sourceName?: string;
  publishedDate?: string;
  sourceText?: string;
};
type GraphEdge = { source: string; target: string; label: string };

function compact(value: string, limit = 30) {
  const text = value.replace(/\s+/g, " ").trim();
  return text.length > limit ? `${text.slice(0, limit - 1)}…` : text;
}
function cleanTitle(value: string) { return value.replace(/\.md$/i, "").replace(/^[-_\s]+|[-_\s]+$/g, "").trim(); }
function extractDate(text: string) {
  const patterns = [/(?:20\d{2})[年\/-](?:0?[1-9]|1[0-2])[月\/-](?:0?[1-9]|[12]\d|3[01])日?/,/(?:0?[1-9]|1[0-2])月(?:0?[1-9]|[12]\d|3[01])日/,/(?:Jan(?:uary)?|Feb(?:ruary)?|Mar(?:ch)?|Apr(?:il)?|May|Jun(?:e)?|Jul(?:y)?|Aug(?:ust)?|Sep(?:tember)?|Oct(?:ober)?|Nov(?:ember)?|Dec(?:ember)?)\s+\d{1,2}(?:,\s*20\d{2})?/i];
  for (const p of patterns) { const m = text.match(p); if (m) return m[0]; }
}
function extractLocation(text: string) {
  for (const p of [/(?:地点|Location|Venue)[:：\s]*([^\n。；;]{2,36})/i,/(?:在|at)\s*((?:BS|CB|EB|SA|SD|HS|IA|IR|PB)[-\s]?\d{1,4}[^\n。；;]*)/i]) { const m = text.match(p); if (m?.[1]) return compact(m[1], 30); }
}
function extractAudience(text: string) {
  for (const p of [/(?:参与对象|面向对象|适用对象|Target audience|Audience)[:：\s]*([^\n。；;]{2,34})/i,/(?:面向|欢迎)([^\n。；;]{2,22})(?:参加|参与|报名|同学|师生)/]) { const m = text.match(p); if (m?.[1]) return compact(m[1], 26); }
}
function extractDepartment(text: string, citation: Citation) {
  for (const p of [/(?:主办|承办|负责部门|组织单位|Organizer|Organised by|Hosted by)[:：\s]*([^\n。；;]{2,38})/i]) { const m = text.match(p); if (m?.[1]) return compact(m[1], 32); }
  return citation.source ? compact(citation.source, 32) : undefined;
}

function makeGraph(citations: Citation[]) {
  const nodes: GraphNode[] = [];
  const edges: GraphEdge[] = [];
  const seen = new Map<string, string>();
  const add = (type: GraphNode["type"], label: string, sourceIndex: number, citation: Citation, detail?: string) => {
    const key = `${type}:${label.trim().toLowerCase()}`;
    const existing = seen.get(key); if (existing) return existing;
    const id = `n${nodes.length + 1}`;
    nodes.push({ id, label, type, sourceIndex, detail, sourceTitle: citation.title, sourceUrl: citation.url, sourceName: citation.source, publishedDate: citation.publishedDate, sourceText: citation.text?.slice(0, 420) });
    seen.set(key, id); return id;
  };

  citations.slice(0, 4).forEach((citation, index) => {
    const sourceIndex = index + 1;
    const title = cleanTitle(citation.title || `来源 ${sourceIndex}`);
    const text = `${title}\n${citation.text || ""}`;
    const activityId = add("activity", compact(title, 34), sourceIndex, citation, "由本次向量检索命中的来源文章形成的活动中心节点。");
    const articleId = add("article", `来源 ${sourceIndex}`, sourceIndex, citation, title);
    edges.push({ source: activityId, target: articleId, label: "来源于" });
    const department = extractDepartment(text, citation); if (department) edges.push({ source: activityId, target: add("department", department, sourceIndex, citation), label: "负责" });
    const audience = extractAudience(text); if (audience) edges.push({ source: activityId, target: add("audience", audience, sourceIndex, citation), label: "面向" });
    const location = extractLocation(text); if (location) edges.push({ source: activityId, target: add("location", location, sourceIndex, citation), label: "位于" });
    const date = extractDate(text); if (date) edges.push({ source: activityId, target: add("time", date, sourceIndex, citation), label: "发生于" });
  });

  return { title: "校园活动知识图谱", summary: "图谱由 AnythingLLM Workspace 向量检索结果直接生成；节点详情可查看本次命中的来源证据。", nodes: nodes.slice(0, 24), edges: edges.slice(0, 45) };
}

export async function POST(request: Request) {
  try {
    const { message, account, workspaceSlug } = await request.json();
    const slug = resolveWorkspaceSlug(account, workspaceSlug);
    if (!message?.trim()) return NextResponse.json({ error: "请输入要生成图谱的主题。" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "当前知识库没有可用的 AnythingLLM Workspace。" }, { status: 400 });

    const query = `${message}\n校园活动 活动名称 时间 地点 参与对象 主办部门 报名`;
    const citations = await vectorSearchAnythingLLM(slug, query, 8, 0.2);
    if (!citations.length) return NextResponse.json({ error: "当前 Workspace 的向量检索没有返回结果。请确认文档已完成 Embedding，或尝试更具体的活动关键词。" }, { status: 422 });
    return NextResponse.json({ graph: makeGraph(citations), citations });
  } catch (error) {
    const message = error instanceof Error ? error.message : "知识图谱生成失败。";
    return NextResponse.json({ error: message }, { status: /Connection|fetch failed|ECONN|ETIMEDOUT/i.test(message) ? 502 : 500 });
  }
}
