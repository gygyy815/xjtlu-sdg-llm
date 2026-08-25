"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { getStoredClientIds } from "@/lib/client-id";
import { getToolHistory, type ToolHistoryEntry } from "@/lib/tool-history";

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

function formatTime(value: number | null) {
  if (!value) return "";
  return new Intl.DateTimeFormat("zh-CN", { month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

function toolConversation(entry: ToolHistoryEntry): Conversation {
  const chatId = `tool:${entry.id}`;
  return {
    id: chatId,
    chatId,
    workspace: entry.workspace,
    workspaceSlug: entry.workspaceSlug,
    title: entry.inputName,
    preview: `已生成 ${entry.outputName}`,
    sentAt: entry.createdAt,
    sourceCount: 0,
    kind: "tool",
    messages: [
      { id: `${chatId}:user`, chatId, workspace: entry.workspace, workspaceSlug: entry.workspaceSlug, role: "user", content: entry.instruction, sentAt: entry.createdAt, sourceCount: 0 },
      { id: `${chatId}:assistant`, chatId, workspace: entry.workspace, workspaceSlug: entry.workspaceSlug, role: "assistant", content: `已生成 ${entry.outputName}。`, sentAt: entry.createdAt, sourceCount: 0 },
    ],
  };
}

export default function HistoryPage() {
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
      const toolItems = getToolHistory().map(toolConversation);
      let remote: Conversation[] = [];
      if (ids.length) {
        const params = new URLSearchParams({ limit: "180", sessionIds: ids.join(",") });
        const response = await fetch(`/api/history?${params.toString()}`, { cache: "no-store" });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || "无法读取对话历史。");
        remote = Array.isArray(data.conversations) ? data.conversations : [];
      }
      const next = [...remote, ...toolItems].sort((a, b) => (b.sentAt || 0) - (a.sentAt || 0));
      setConversations(next);
      setSelectedId((current) => current && next.some((item) => item.id === current) ? current : (next[0]?.id || ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法读取对话历史。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

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

  return <main className="historyPage userHistoryPage">
    <header className="historyTop"><Link href="/">← 返回助手</Link><span>我的对话</span></header>

    <section className="historyHero">
      <span>最近使用</span>
      <h1>继续之前的校园问答</h1>
      <p>搜索你最近问过的问题，或从之前使用过的知识库继续查询。</p>
    </section>

    <section className="historyPanel">
      <div className="historyToolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索我的问题或回答…" />
        <select value={workspace} onChange={(event) => { setWorkspace(event.target.value); setSelectedId(""); }}><option value="all">全部知识库</option>{workspaces.map((item) => <option key={item}>{item}</option>)}</select>
        <button type="button" onClick={load}>刷新</button>
      </div>

      {loading && <div className="historyEmpty">正在读取你的最近对话…</div>}
      {error && <div className="historyError"><strong>暂时无法读取历史记录</strong><p>{error}</p></div>}
      {!loading && !error && !filtered.length && <div className="historyEmpty"><strong>还没有历史记录</strong><p>从首页开始一次对话后，你最近的问答会显示在这里。</p><Link href="/">开始提问 →</Link></div>}

      {!loading && !error && filtered.length > 0 && <div className="historyWorkspace">
        <aside className="conversationList">{filtered.map((item) => <button key={item.id} className={selected?.id === item.id ? "active" : ""} onClick={() => setSelectedId(item.id)}>
          <div className="listTop"><span>{item.workspace}</span><small>{formatTime(item.sentAt)}</small></div>
          <strong>{item.title}</strong>
          <p>{item.preview}</p>
        </button>)}</aside>

        <section className="conversationDetail">
          {selected && <>
            <div className="detailHead"><div><span>{selected.workspace}</span><h2>{selected.title}</h2></div><button type="button" onClick={continueConversation}>继续这个问题</button></div>
            <div className="messageStack">{selected.messages.map((item) => <article key={item.id} className={`historyMessage ${item.role}`}>
              <div>{item.role === "user" ? "你" : "AI"}</div>
              <section><p>{item.content}</p>{item.sourceCount > 0 && <small>{item.sourceCount} 个来源</small>}</section>
            </article>)}</div>
          </>}
        </section>
      </div>}
    </section>

    <section className="historyPrivacy"><span>隐私提示</span><p>当前 Demo 的历史按浏览器会话保存。使用公共电脑时，完成体验后建议关闭浏览器或清理站点数据。</p></section>

    <style jsx>{`
      .historyPage{min-height:100vh;background:#f7faf8;padding:0 28px 80px;color:#20382f}.historyTop{height:72px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dfe8e3}.historyTop a,.historyEmpty a{color:#2f755d;text-decoration:none;font-weight:750}.historyTop span,.historyHero>span{font-size:12px;letter-spacing:.12em;color:#4d806b;font-weight:800}.historyHero,.historyPanel,.historyPrivacy{max-width:1120px;margin-left:auto;margin-right:auto}.historyHero{margin-top:52px}.historyHero h1{font-size:40px;line-height:1.2;margin:9px 0}.historyHero>p{color:#6d7e76;line-height:1.7}.historyPanel{margin-top:24px;background:#fff;border:1px solid #dfe8e3;border-radius:18px;padding:20px;box-shadow:0 10px 32px rgba(36,95,76,.05)}.historyToolbar{display:grid;grid-template-columns:minmax(0,1fr) 220px auto;gap:10px}.historyToolbar input,.historyToolbar select{border:1px solid #d8e5de;border-radius:11px;padding:11px 12px;background:#fff;font:inherit}.historyToolbar button,.detailHead button{border:0;border-radius:10px;background:#2f755d;color:#fff;padding:0 16px;font-weight:750;cursor:pointer}.historyEmpty,.historyError{margin-top:18px;padding:36px;text-align:center;border-radius:14px;background:#f6faf8;color:#708178}.historyError{background:#fff5f3;color:#92544f}.historyWorkspace{display:grid;grid-template-columns:330px minmax(0,1fr);gap:14px;margin-top:18px;min-height:480px}.conversationList{display:flex;flex-direction:column;gap:8px;max-height:650px;overflow:auto;padding-right:4px}.conversationList button{text-align:left;border:1px solid #e0e9e4;background:#fbfdfc;border-radius:14px;padding:13px;cursor:pointer;color:#233c32}.conversationList button.active{border-color:#9bc7b2;background:#edf7f2;box-shadow:0 0 0 2px #e2f1e9}.listTop{display:flex;justify-content:space-between;gap:10px;align-items:center;margin-bottom:6px}.listTop span{font-size:11px;color:#4d806b;font-weight:700}.listTop small{font-size:10px;color:#93a099}.conversationList strong{display:block;font-size:14px}.conversationList p{margin:6px 0 0;color:#6e7d76;font-size:12px;line-height:1.5;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.conversationDetail{border:1px solid #e2e9e5;border-radius:14px;background:#fafcfb;padding:18px;min-width:0}.detailHead{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding-bottom:14px;border-bottom:1px solid #e3e9e6}.detailHead span{font-size:11px;color:#4d806b}.detailHead h2{margin:5px 0;font-size:22px}.detailHead button{padding:9px 13px;white-space:nowrap}.messageStack{display:grid;gap:12px;margin-top:16px}.historyMessage{display:grid;grid-template-columns:38px minmax(0,1fr);gap:10px}.historyMessage>div{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#2f755d;color:#fff;font-size:11px;font-weight:800}.historyMessage.user>div{background:#73837b}.historyMessage section{background:#fff;border:1px solid #e0e7e3;border-radius:13px;padding:12px 14px}.historyMessage.user section{background:#eef6f2;border-color:#d9e8e0}.historyMessage p{white-space:pre-wrap;line-height:1.7;margin:0;overflow-wrap:anywhere}.historyMessage small{display:block;margin-top:7px;color:#7a8981}.historyPrivacy{margin-top:18px;padding:16px 18px;border-radius:12px;background:#eef7f2;color:#557065}.historyPrivacy span{font-weight:750}.historyPrivacy p{margin:4px 0 0;line-height:1.65}@media(max-width:860px){.historyPage{padding-inline:14px}.historyWorkspace{grid-template-columns:1fr}.historyToolbar{grid-template-columns:1fr}.historyToolbar button{min-height:42px}.historyHero h1{font-size:32px}}
    `}</style>
  </main>;
}
