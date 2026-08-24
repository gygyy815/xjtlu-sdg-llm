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
  kind: "session";
  apiSessionId: string;
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

function normalizeMessage(item: RawHistoryItem, label: string, slug: string, sessionId: string, index: number): HistoryItem | null {
  const time = timestamp(item.sentAt ?? item.createdAt);
  const role = String(item.role || "assistant").toLowerCase() === "user" ? "user" : "assistant";
  const content = String(item.content ?? item.text ?? "").trim();
  if (!content) return null;
  const sources = Array.isArray(item.sources) ? item.sources.length : 0;
  const rawChatId = item.chatId;
  const chatId = rawChatId !== undefined && rawChatId !== null && String(rawChatId).trim()
    ? String(rawChatId)
    : `${sessionId}-${Math.floor(index / 2)}`;
  return {
    id: `${slug}-${sessionId}-${chatId}-${role}-${index}`,
    chatId,
    workspace: label,
    workspaceSlug: slug,
    role,
    content,
    sentAt: time || null,
    sourceCount: sources,
  };
}

function buildConversation(id: string, messages: HistoryItem[], apiSessionId: string): Conversation {
  const ordered = [...messages].sort((a, b) => (a.sentAt || 0) - (b.sentAt || 0));
  const user = ordered.find((item) => item.role === "user");
  const assistant = [...ordered].reverse().find((item) => item.role === "assistant");
  const latest = ordered.length ? Math.max(...ordered.map((item) => item.sentAt || 0)) : 0;
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
    kind: "session",
    apiSessionId,
  };
}

function emptyHistory(sessionCount: number, warning?: string) {
  return {
    source: "anythingllm",
    privacyScope: "browser-session",
    workspaceCount: 0,
    messageCount: 0,
    conversationCount: 0,
    threadCount: 0,
    sessionCount,
    items: [] as HistoryItem[],
    conversations: [] as Conversation[],
    warnings: warning ? [{ workspace: "AnythingLLM", session: "", warning }] : [],
    degraded: Boolean(warning),
  };
}

export async function GET(request: Request) {
  const url = new URL(request.url);
  const requestedLimit = Number(url.searchParams.get("limit") || 120);
  const perSessionLimit = Math.max(20, Math.min(200, Number.isFinite(requestedLimit) ? requestedLimit : 120));
  const sessionIds = (url.searchParams.get("sessionIds") || "")
    .split(",")
    .map((item) => item.trim())
    .filter((item) => /^[0-9a-f-]{16,}$/i.test(item))
    .slice(0, 20);

  const base = process.env.ANYTHINGLLM_BASE_URL?.replace(/\/$/, "");
  const key = process.env.ANYTHINGLLM_API_KEY;

  // History is optional for local UI-only testing. Missing or unreachable AnythingLLM
  // should not make the whole Demo look broken or flood the dev console with HTTP 500s.
  if (!base || !key) {
    return NextResponse.json(emptyHistory(sessionIds.length, "AnythingLLM is not configured; history is temporarily unavailable."));
  }

  // Privacy-first default: without browser-owned API session IDs we return no history.
  // We intentionally do not enumerate all Workspace chats or all AnythingLLM Threads here.
  if (!sessionIds.length) {
    return NextResponse.json(emptyHistory(0));
  }

  try {
    const configured = workspaceMap();
    const live = await listAnythingLLMWorkspaces();
    const liveSlugs = new Set(live.map((item) => item.slug));
    const targets = Object.entries(configured).filter(([, slug]) => liveSlugs.has(slug));

    const jobs = targets.flatMap(([label, slug]) => sessionIds.map((apiSessionId) => ({ label, slug, apiSessionId })));
    const results = await Promise.all(jobs.map(async ({ label, slug, apiSessionId }) => {
      const endpoint = `${base}/api/v1/workspace/${encodeURIComponent(slug)}/chats?apiSessionId=${encodeURIComponent(apiSessionId)}&limit=${perSessionLimit}&orderBy=asc`;
      try {
        const response = await fetch(endpoint, {
          headers: { Authorization: `Bearer ${key}` },
          cache: "no-store",
        });
        if (!response.ok) return { label, slug, apiSessionId, history: [] as RawHistoryItem[], warning: `HTTP ${response.status}` };
        const data = await response.json();
        return { label, slug, apiSessionId, history: Array.isArray(data?.history) ? data.history as RawHistoryItem[] : [], warning: "" };
      } catch (error) {
        return {
          label,
          slug,
          apiSessionId,
          history: [] as RawHistoryItem[],
          warning: error instanceof Error ? error.message : "History request failed",
        };
      }
    }));

    const conversations: Conversation[] = [];
    const items: HistoryItem[] = [];

    for (const { label, slug, apiSessionId, history } of results) {
      const normalized = history
        .map((item, index) => normalizeMessage(item, label, slug, apiSessionId, index))
        .filter((item): item is HistoryItem => Boolean(item));
      if (!normalized.length) continue;
      items.push(...normalized);

      const grouped = new Map<string, HistoryItem[]>();
      normalized.forEach((item) => {
        const groupKey = item.chatId || apiSessionId;
        grouped.set(groupKey, [...(grouped.get(groupKey) || []), item]);
      });
      grouped.forEach((messages, chatId) => {
        conversations.push(buildConversation(`${slug}:${apiSessionId}:${chatId}`, messages, apiSessionId));
      });
    }

    conversations.sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
    items.sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));

    const warnings = results
      .filter((item) => item.warning)
      .map((item) => ({ workspace: item.label, session: item.apiSessionId, warning: item.warning }));

    return NextResponse.json({
      source: "anythingllm",
      privacyScope: "browser-session",
      workspaceCount: targets.length,
      messageCount: items.length,
      conversationCount: conversations.length,
      threadCount: 0,
      sessionCount: sessionIds.length,
      items,
      conversations,
      warnings,
      degraded: warnings.length > 0,
    });
  } catch (error) {
    const warning = error instanceof Error ? error.message : "无法读取 AnythingLLM 对话历史。";
    return NextResponse.json(emptyHistory(sessionIds.length, warning));
  }
}
