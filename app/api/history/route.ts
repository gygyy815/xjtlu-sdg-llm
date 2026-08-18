import { NextResponse } from "next/server";
import { listAnythingLLMWorkspaces, workspaceMap } from "@/lib/anythingllm";

type RawHistoryItem = {
  chatId?: unknown;
  role?: unknown;
  content?: unknown;
  text?: unknown;
  sentAt?: unknown;
  createdAt?: unknown;
  sources?: unknown;
};

type HistoryItem = {
  id: string;
  chatId: string;
  workspace: string;
  workspaceSlug: string;
  role: "user" | "assistant";
  content: string;
  sentAt: number | null;
  sourceCount: number;
};

function timestamp(value: unknown) {
  if (typeof value === "number" && Number.isFinite(value)) return value < 1_000_000_000_000 ? value * 1000 : value;
  if (typeof value === "string") {
    const numeric = Number(value);
    if (Number.isFinite(numeric) && numeric > 0) return numeric < 1_000_000_000_000 ? numeric * 1000 : numeric;
    const parsed = Date.parse(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return 0;
}

function titleFrom(value: string) {
  const clean = value.replace(/\s+/g, " ").trim();
  if (!clean) return "未命名问答";
  return clean.length > 44 ? `${clean.slice(0, 43)}…` : clean;
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") || 120);
  const perWorkspaceLimit = Math.max(20, Math.min(300, Number.isFinite(requestedLimit) ? requestedLimit : 120));
  const base = process.env.ANYTHINGLLM_BASE_URL?.replace(/\/$/, "");
  const key = process.env.ANYTHINGLLM_API_KEY;
  if (!base || !key) return NextResponse.json({ error: "AnythingLLM environment variables are not configured." }, { status: 500 });

  try {
    const configured = workspaceMap();
    const live = await listAnythingLLMWorkspaces();
    const liveSlugs = new Set(live.map((item) => item.slug));
    const targets = Object.entries(configured).filter(([, slug]) => liveSlugs.has(slug));

    const results = await Promise.all(targets.map(async ([label, slug]) => {
      const response = await fetch(`${base}/api/v1/workspace/${encodeURIComponent(slug)}/chats?limit=${perWorkspaceLimit}&orderBy=desc`, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      if (!response.ok) return { label, slug, history: [] as RawHistoryItem[], warning: `HTTP ${response.status}` };
      const data = await response.json();
      return { label, slug, history: Array.isArray(data?.history) ? data.history as RawHistoryItem[] : [], warning: "" };
    }));

    const items: HistoryItem[] = results.flatMap(({ label, slug, history }) => history.map((item, index) => {
      const time = timestamp(item.sentAt ?? item.createdAt);
      const role = String(item.role || "assistant").toLowerCase() === "user" ? "user" : "assistant";
      const content = String(item.content ?? item.text ?? "").trim();
      const sources = Array.isArray(item.sources) ? item.sources.length : 0;
      const rawChatId = item.chatId;
      const chatId = rawChatId !== undefined && rawChatId !== null && String(rawChatId).trim()
        ? String(rawChatId)
        : `fallback-${time || "na"}-${Math.floor(index / 2)}`;
      return {
        id: `${slug}-${chatId}-${role}-${index}`,
        chatId,
        workspace: label,
        workspaceSlug: slug,
        role,
        content,
        sentAt: time || null,
        sourceCount: sources,
      };
    })).filter((item) => item.content);

    items.sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));

    const grouped = new Map<string, HistoryItem[]>();
    for (const item of items) {
      const keyName = `${item.workspaceSlug}:${item.chatId}`;
      const list = grouped.get(keyName) || [];
      list.push(item);
      grouped.set(keyName, list);
    }

    const conversations = Array.from(grouped.entries()).map(([id, messages]) => {
      const ordered = [...messages].sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
      const user = ordered.find((item) => item.role === "user");
      const assistant = [...ordered].reverse().find((item) => item.role === "assistant");
      const latest = Math.max(...ordered.map((item) => item.sentAt || 0));
      return {
        id,
        chatId: ordered[0]?.chatId || "",
        workspace: ordered[0]?.workspace || "",
        workspaceSlug: ordered[0]?.workspaceSlug || "",
        title: titleFrom(user?.content || assistant?.content || ""),
        preview: assistant?.content || user?.content || "",
        sentAt: latest || null,
        sourceCount: ordered.reduce((sum, item) => sum + item.sourceCount, 0),
        messages: ordered,
      };
    }).sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));

    return NextResponse.json({
      source: "anythingllm",
      workspaceCount: targets.length,
      messageCount: items.length,
      conversationCount: conversations.length,
      items,
      conversations,
      warnings: results.filter((item) => item.warning).map((item) => ({ workspace: item.label, warning: item.warning })),
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法读取 AnythingLLM 对话历史。" }, { status: 500 });
  }
}
