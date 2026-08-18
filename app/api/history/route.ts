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

type Conversation = {
  id: string;
  chatId: string;
  workspace: string;
  workspaceSlug: string;
  title: string;
  preview: string;
  sentAt: number | null;
  sourceCount: number;
  messages: HistoryItem[];
  kind: "thread" | "session";
  threadSlug?: string;
  threadName?: string;
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
  if (!clean) return "未命名对话";
  return clean.length > 44 ? `${clean.slice(0, 43)}…` : clean;
}

function normalizeMessage(item: RawHistoryItem, label: string, slug: string, idPrefix: string, index: number): HistoryItem | null {
  const time = timestamp(item.sentAt ?? item.createdAt);
  const role = String(item.role || "assistant").toLowerCase() === "user" ? "user" : "assistant";
  const content = String(item.content ?? item.text ?? "").trim();
  if (!content) return null;
  const sources = Array.isArray(item.sources) ? item.sources.length : 0;
  const rawChatId = item.chatId;
  const chatId = rawChatId !== undefined && rawChatId !== null && String(rawChatId).trim() ? String(rawChatId) : `${idPrefix}-${Math.floor(index / 2)}`;
  return {
    id: `${slug}-${idPrefix}-${chatId}-${role}-${index}`,
    chatId,
    workspace: label,
    workspaceSlug: slug,
    role,
    content,
    sentAt: time || null,
    sourceCount: sources,
  };
}

function buildConversation(id: string, messages: HistoryItem[], extra?: Partial<Conversation>): Conversation {
  const ordered = [...messages].sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
  const user = ordered.find((item) => item.role === "user");
  const assistant = [...ordered].reverse().find((item) => item.role === "assistant");
  const latest = ordered.length ? Math.max(...ordered.map((item) => item.sentAt || 0)) : 0;
  const threadName = extra?.threadName?.trim();
  return {
    id,
    chatId: ordered[0]?.chatId || extra?.chatId || "",
    workspace: ordered[0]?.workspace || extra?.workspace || "",
    workspaceSlug: ordered[0]?.workspaceSlug || extra?.workspaceSlug || "",
    title: threadName || titleFrom(user?.content || assistant?.content || ""),
    preview: assistant?.content || user?.content || "",
    sentAt: latest || null,
    sourceCount: ordered.reduce((sum, item) => sum + item.sourceCount, 0),
    messages: ordered,
    kind: extra?.kind || "session",
    threadSlug: extra?.threadSlug,
    threadName: threadName || undefined,
  };
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
    const liveBySlug = new Map(live.map((item) => [item.slug, item]));
    const targets = Object.entries(configured).filter(([, slug]) => liveBySlug.has(slug));

    const sessionResults = await Promise.all(targets.map(async ([label, slug]) => {
      const response = await fetch(`${base}/api/v1/workspace/${encodeURIComponent(slug)}/chats?limit=${perWorkspaceLimit}&orderBy=desc`, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      if (!response.ok) return { label, slug, history: [] as RawHistoryItem[], warning: `HTTP ${response.status}` };
      const data = await response.json();
      return { label, slug, history: Array.isArray(data?.history) ? data.history as RawHistoryItem[] : [], warning: "" };
    }));

    const sessionItems: HistoryItem[] = sessionResults.flatMap(({ label, slug, history }) => history
      .map((item, index) => normalizeMessage(item, label, slug, `session-${timestamp(item.sentAt ?? item.createdAt) || "na"}`, index))
      .filter((item): item is HistoryItem => Boolean(item)));

    const groupedSessions = new Map<string, HistoryItem[]>();
    for (const item of sessionItems) {
      const keyName = `${item.workspaceSlug}:${item.chatId}`;
      const list = groupedSessions.get(keyName) || [];
      list.push(item);
      groupedSessions.set(keyName, list);
    }
    const sessionConversations = Array.from(groupedSessions.entries()).map(([id, messages]) => buildConversation(id, messages, { kind: "session" }));

    const threadJobs = targets.flatMap(([label, slug]) => {
      const workspace = liveBySlug.get(slug);
      return (workspace?.threads || []).map((thread) => ({ label, slug, thread }));
    }).slice(0, 80);

    const threadResults = await Promise.all(threadJobs.map(async ({ label, slug, thread }) => {
      const response = await fetch(`${base}/api/v1/workspace/${encodeURIComponent(slug)}/thread/${encodeURIComponent(thread.slug)}/chats`, {
        headers: { Authorization: `Bearer ${key}` },
        cache: "no-store",
      });
      if (!response.ok) return { label, slug, thread, history: [] as RawHistoryItem[], warning: `HTTP ${response.status}` };
      const data = await response.json();
      return { label, slug, thread, history: Array.isArray(data?.history) ? data.history as RawHistoryItem[] : [], warning: "" };
    }));

    const threadConversations = threadResults.map(({ label, slug, thread, history }) => {
      const messages = history
        .map((item, index) => normalizeMessage(item, label, slug, `thread-${thread.slug}`, index))
        .filter((item): item is HistoryItem => Boolean(item))
        .map((item) => ({ ...item, chatId: thread.slug }));
      return buildConversation(`${slug}:thread:${thread.slug}`, messages, {
        kind: "thread",
        chatId: thread.slug,
        workspace: label,
        workspaceSlug: slug,
        threadSlug: thread.slug,
        threadName: thread.name,
      });
    }).filter((item) => item.messages.length);

    const conversations = [...threadConversations, ...sessionConversations]
      .sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
    const items = conversations.flatMap((item) => item.messages);

    return NextResponse.json({
      source: "anythingllm",
      workspaceCount: targets.length,
      messageCount: items.length,
      conversationCount: conversations.length,
      threadCount: threadConversations.length,
      sessionCount: sessionConversations.length,
      items,
      conversations,
      warnings: [
        ...sessionResults.filter((item) => item.warning).map((item) => ({ workspace: item.label, warning: item.warning })),
        ...threadResults.filter((item) => item.warning).map((item) => ({ workspace: item.label, thread: item.thread.slug, warning: item.warning })),
      ],
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "无法读取 AnythingLLM 对话历史。" }, { status: 500 });
  }
}
