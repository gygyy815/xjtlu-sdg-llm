"use client";

import { useEffect, useMemo, useState } from "react";
import { getStoredClientIds } from "@/lib/client-id";
import { getToolHistory, type ToolHistoryEntry } from "@/lib/tool-history";
import { useProductLanguage } from "@/lib/product-language";

type HistoryMessage = {
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
  messages: HistoryMessage[];
  kind: "session" | "tool";
};

function formatTime(value: number | null, lang: "zh" | "en") {
  if (!value) return "";
  return new Intl.DateTimeFormat(lang === "en" ? "en-GB" : "zh-CN", {
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toolConversation(entry: ToolHistoryEntry, generated: string): Conversation {
  const chatId = `tool:${entry.id}`;
  return {
    id: chatId,
    chatId,
    workspace: entry.workspace,
    workspaceSlug: entry.workspaceSlug,
    title: entry.inputName,
    preview: `${generated} ${entry.outputName}`,
    sentAt: entry.createdAt,
    sourceCount: 0,
    kind: "tool",
    messages: [
      { id: `${chatId}:user`, chatId, workspace: entry.workspace, workspaceSlug: entry.workspaceSlug, role: "user", content: entry.instruction, sentAt: entry.createdAt, sourceCount: 0 },
      { id: `${chatId}:assistant`, chatId, workspace: entry.workspace, workspaceSlug: entry.workspaceSlug, role: "assistant", content: `${generated} ${entry.outputName}.`, sentAt: entry.createdAt, sourceCount: 0 },
    ],
  };
}

export default function HistoryPage() {
  const { lang, t } = useProductLanguage();
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [query, setQuery] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const ids = getStoredClientIds();
      const toolItems = getToolHistory().map((entry) => toolConversation(entry, t("已生成", "Generated")));
      let remote: Conversation[] = [];
      if (ids.length) {
        const params = new URLSearchParams({ limit: "180", sessionIds: ids.join(",") });
        const response = await fetch(`/api/history?${params.toString()}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || t("无法读取对话历史。", "Unable to load chat history."));
        remote = Array.isArray(data.conversations) ? data.conversations : [];
      }
      const next = [...remote, ...toolItems].sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
      setConversations(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : (next[0]?.id || ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : t("无法读取对话历史。", "Unable to load chat history."));
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, [lang]);

  const workspaces = useMemo(() => Array.from(new Set(conversations.map((item) => item.workspace))).filter(Boolean), [conversations]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((item) => {
      if (workspace !== "all" && item.workspace !== workspace) return false;
      if (!q) return true;
      return `${item.workspace} ${item.title} ${item.preview} ${item.messages.map((message) => message.content).join(" ")}`.toLowerCase().includes(q);
    });
  }, [conversations, query, workspace]);
  const selected = filtered.find((item) => item.id === selectedId) || filtered[0] || null;

  function continueConversation() {
    const question = selected?.messages.find((item) => item.role === "user")?.content;
    if (!question || !selected) return;
    localStorage.setItem("xjtlu-history-prefill", JSON.stringify({ message: question, workspaceSlug: selected.workspaceSlug }));
    window.location.href = "/";
  }

  return <main className="historyPage cleanPage">
    <section className="cleanPageHeader">
      <span>{t("最近使用", "RECENT ACTIVITY")}</span>
      <h1>{t("继续之前的校园问答", "Continue your previous campus questions")}</h1>
      <p>{t("搜索你最近问过的问题，或从之前使用过的知识库继续查询。", "Search questions you asked recently, or continue with a knowledge base you used before.")}</p>
    </section>

    <section className="historyPanel cleanCard">
      <div className="historyToolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("搜索我的问题或回答…", "Search my questions or answers…")} />
        <select value={workspace} onChange={(event) => { setWorkspace(event.target.value); setSelectedId(""); }}><option value="all">{t("全部知识库", "All knowledge bases")}</option>{workspaces.map((item) => <option key={item}>{item}</option>)}</select>
        <button type="button" onClick={load}>{t("刷新", "Refresh")}</button>
      </div>

      {loading && <div className="historyEmpty">{t("正在读取你的最近对话…", "Loading your recent conversations…")}</div>}
      {error && <div className="historyError"><strong>{t("暂时无法读取历史记录", "Unable to load history right now")}</strong><p>{error}</p></div>}
      {!loading && !error && !filtered.length && <div className="historyEmpty"><strong>{t("还没有历史记录", "No conversation history yet")}</strong><p>{t("从首页开始一次对话后，你最近的问答会显示在这里。", "Start a conversation and your recent questions will appear here.")}</p><button type="button" className="textAction" onClick={() => { window.location.href = "/"; }}>{t("开始提问 →", "Start a chat →")}</button></div>}

      {!loading && !error && filtered.length > 0 && <div className="historyWorkspace">
        <aside className="conversationList">{filtered.map((item) => <button key={item.id} className={selected?.id === item.id ? "active" : ""} onClick={() => setSelectedId(item.id)}>
          <div className="listTop"><span>{item.workspace}</span><small>{formatTime(item.sentAt, lang)}</small></div>
          <strong>{item.title}</strong>
          <p>{item.preview}</p>
        </button>)}</aside>

        <section className="conversationDetail">
          {selected && <>
            <div className="detailHead"><div><span>{selected.workspace}</span><h2>{selected.title}</h2></div><button type="button" onClick={continueConversation}>{t("继续这个问题", "Continue this question")}</button></div>
            <div className="messageStack">{selected.messages.map((item) => <article key={item.id} className={`historyMessage ${item.role}`}>
              <div>{item.role === "user" ? t("你", "You") : "AI"}</div>
              <section><p>{item.content}</p>{item.sourceCount > 0 && <small>{t(`${item.sourceCount} 个来源`, `${item.sourceCount} sources`)}</small>}</section>
            </article>)}</div>
          </>}
        </section>
      </div>}
    </section>

    <section className="historyPrivacy cleanCard"><strong>{t("隐私提示", "Privacy tip")}</strong><p>{t("当前 Demo 的历史按浏览器会话保存。使用公共电脑时，完成体验后建议关闭浏览器或清理站点数据。", "This demo keeps history within the current browser session. On a public computer, close the browser or clear site data when you finish.")}</p></section>
  </main>;
}
