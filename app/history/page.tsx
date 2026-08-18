"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

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
  kind: "thread" | "session";
  threadSlug?: string;
  threadName?: string;
};

function formatTime(value: number | null) {
  if (!value) return "时间未记录";
  return new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "2-digit", day: "2-digit", hour: "2-digit", minute: "2-digit" }).format(new Date(value));
}

export default function HistoryPage() {
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [query, setQuery] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [selectedId, setSelectedId] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [followUp, setFollowUp] = useState("");
  const [continuing, setContinuing] = useState(false);
  const [continueError, setContinueError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/history?limit=180", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "无法读取对话历史。");
      const next = Array.isArray(data.conversations) ? data.conversations : [];
      setConversations(next);
      setSelectedId((current) => current && next.some((item: Conversation) => item.id === current) ? current : (next[0]?.id || ""));
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法读取对话历史。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const workspaces = useMemo(() => Array.from(new Set(conversations.map((item) => item.workspace))), [conversations]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return conversations.filter((item) => {
      if (workspace !== "all" && item.workspace !== workspace) return false;
      if (!q) return true;
      return `${item.workspace} ${item.title} ${item.preview} ${item.messages.map((message) => message.content).join(" ")}`.toLowerCase().includes(q);
    });
  }, [conversations, query, workspace]);

  const selected = filtered.find((item) => item.id === selectedId) || filtered[0] || null;
  const messageCount = conversations.reduce((sum, item) => sum + item.messages.length, 0);
  const sourceCount = conversations.reduce((sum, item) => sum + item.sourceCount, 0);
  const threadCount = conversations.filter((item) => item.kind === "thread").length;

  function bringBackQuestion() {
    const question = selected?.messages.find((item) => item.role === "user")?.content;
    if (!question || !selected) return;
    localStorage.setItem("xjtlu-history-prefill", JSON.stringify({ message: question, workspaceSlug: selected.workspaceSlug }));
    window.location.href = "/";
  }

  async function continueThread() {
    if (!selected?.threadSlug || !followUp.trim() || continuing) return;
    const text = followUp.trim();
    setContinuing(true);
    setContinueError("");
    try {
      const response = await fetch("/api/history/thread-chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workspaceSlug: selected.workspaceSlug, threadSlug: selected.threadSlug, message: text }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "Thread 续聊失败。");
      const now = Date.now();
      const additions: HistoryMessage[] = [
        { id: `local-user-${now}`, chatId: selected.threadSlug, workspace: selected.workspace, workspaceSlug: selected.workspaceSlug, role: "user", content: text, sentAt: now, sourceCount: 0 },
        { id: `local-ai-${now}`, chatId: selected.threadSlug, workspace: selected.workspace, workspaceSlug: selected.workspaceSlug, role: "assistant", content: data.text || "未返回内容。", sentAt: now + 1, sourceCount: Array.isArray(data.citations) ? data.citations.length : 0 },
      ];
      setConversations((current) => current.map((item) => item.id === selected.id ? {
        ...item,
        messages: [...item.messages, ...additions],
        preview: data.text || item.preview,
        sentAt: now,
        sourceCount: item.sourceCount + additions[1].sourceCount,
      } : item));
      setFollowUp("");
    } catch (err) {
      setContinueError(err instanceof Error ? err.message : "Thread 续聊失败。");
    } finally {
      setContinuing(false);
    }
  }

  return <main className="historyPage">
    <header className="historyTop"><Link href="/">← 返回助手</Link><span>CONVERSATION HISTORY · ANYTHINGLLM</span></header>

    <section className="historyHero">
      <span>对话历史</span>
      <h1>查看历史，并继续真正的 AnythingLLM Thread</h1>
      <p>现在会同时读取普通 API 会话与 AnythingLLM 命名 Thread。带有“真实 Thread”标记的记录可以直接在本页继续追问，并沿用原 Thread 的上下文。</p>
      <div className="historyStats"><article><strong>{conversations.length}</strong><span>历史会话</span></article><article><strong>{threadCount}</strong><span>真实 Thread</span></article><article><strong>{workspaces.length}</strong><span>Workspace</span></article><article><strong>{sourceCount}</strong><span>来源引用</span></article></div>
    </section>

    <section className="historyPanel">
      <div className="historyToolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索问题、回答或知识库…" />
        <select value={workspace} onChange={(event) => { setWorkspace(event.target.value); setSelectedId(""); }}><option value="all">全部知识库</option>{workspaces.map((item) => <option key={item}>{item}</option>)}</select>
        <button type="button" onClick={load}>刷新</button>
      </div>

      {loading && <div className="historyEmpty">正在从 AnythingLLM 读取对话历史与 Thread…</div>}
      {error && <div className="historyError"><strong>暂时无法读取历史记录</strong><p>{error}</p></div>}
      {!loading && !error && !filtered.length && <div className="historyEmpty"><strong>当前筛选条件下没有历史会话。</strong><p>如果恢复后的 Workspace 本身没有保存聊天记录，这里不会生成虚假历史。</p></div>}

      {!loading && !error && filtered.length > 0 && <div className="historyWorkspace">
        <aside className="conversationList">{filtered.map((item) => <button key={item.id} className={selected?.id === item.id ? "active" : ""} onClick={() => { setSelectedId(item.id); setFollowUp(""); setContinueError(""); }}>
          <div className="listBadges"><span>{item.workspace}</span>{item.kind === "thread" && <b>Thread</b>}</div>
          <strong>{item.title}</strong>
          <small>{formatTime(item.sentAt)}</small>
          <p>{item.preview}</p>
        </button>)}</aside>

        <section className="conversationDetail">
          {selected && <>
            <div className="detailHead"><div><div className="detailBadges"><span>{selected.workspace}</span>{selected.kind === "thread" ? <b>真实 Thread</b> : <b className="sessionBadge">API 会话</b>}</div><h2>{selected.title}</h2><small>{formatTime(selected.sentAt)} · {selected.messages.length} 条消息 · {selected.sourceCount} 个来源</small></div>{selected.kind === "session" && <button type="button" onClick={bringBackQuestion}>带回输入框</button>}</div>
            <div className="messageStack">{selected.messages.map((item) => <article key={item.id} className={`historyMessage ${item.role}`}>
              <div>{item.role === "user" ? "你" : "AI"}</div>
              <section><span>{item.role === "user" ? "用户" : "AI"}</span><p>{item.content}</p>{item.sourceCount > 0 && <small>{item.sourceCount} 个来源</small>}</section>
            </article>)}</div>

            {selected.threadSlug && <div className="threadComposer">
              <div><strong>继续此 Thread</strong><span>后续问题会写回 AnythingLLM 原 Thread，并保留已有上下文。</span></div>
              <textarea value={followUp} onChange={(event) => setFollowUp(event.target.value)} placeholder="继续追问…" onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); continueThread(); } }} />
              <div className="threadActions">{continueError && <span>{continueError}</span>}<button type="button" disabled={!followUp.trim() || continuing} onClick={continueThread}>{continuing ? "正在回复…" : "发送到原 Thread"}</button></div>
            </div>}
          </>}
        </section>
      </div>}
    </section>

    <section className="historyNote"><strong>两类历史的区别</strong><p>“真实 Thread”来自 AnythingLLM Workspace Thread API，可以原地续聊；“API 会话”是此前 Demo 通过 sessionId 保存的历史，只能带回首页重新提问。后续新建对话可以逐步迁移到 Thread 模式。</p></section>

    <style jsx>{`
      .historyPage{min-height:100vh;background:#f6f7fa;padding:0 28px 80px;color:#19232d}.historyTop{height:70px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e3e7ed}.historyTop a{color:#5965d8;text-decoration:none;font-weight:700}.historyTop span,.historyHero>span{font-size:11px;letter-spacing:.13em;color:#6570dc;font-weight:800}.historyHero,.historyPanel,.historyNote{max-width:1120px;margin-left:auto;margin-right:auto}.historyHero{margin-top:48px}.historyHero h1{font-size:34px;margin:9px 0}.historyHero p{color:#697782;line-height:1.7}.historyStats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:22px}.historyStats article{background:#fff;border:1px solid #e1e6ec;border-radius:15px;padding:18px}.historyStats strong{display:block;font-size:28px}.historyStats span{font-size:12px;color:#7a8790}.historyPanel{margin-top:20px;background:#fff;border:1px solid #e0e5eb;border-radius:18px;padding:20px}.historyToolbar{display:grid;grid-template-columns:minmax(0,1fr) 220px auto;gap:10px}.historyToolbar input,.historyToolbar select{border:1px solid #d9e0e7;border-radius:10px;padding:10px 12px;background:#fff;font:inherit}.historyToolbar button,.detailHead button,.threadActions button{border:0;border-radius:10px;background:#5a63e7;color:#fff;padding:0 16px;font-weight:700;cursor:pointer}.historyEmpty,.historyError{margin-top:18px;padding:32px;text-align:center;border-radius:14px;background:#f8f9fb;color:#7b8791}.historyError{background:#fff5f4;color:#92544f}.historyWorkspace{display:grid;grid-template-columns:320px minmax(0,1fr);gap:14px;margin-top:18px;min-height:500px}.conversationList{display:flex;flex-direction:column;gap:8px;max-height:680px;overflow:auto;padding-right:4px}.conversationList button{text-align:left;border:1px solid #e2e7ec;background:#fbfcfd;border-radius:13px;padding:12px;cursor:pointer;color:#23303a}.conversationList button.active{border-color:#8c94ed;background:#f0f1ff;box-shadow:0 0 0 2px #eceeff}.conversationList strong,.conversationList small,.conversationList p{display:block}.listBadges,.detailBadges{display:flex;gap:6px;align-items:center;margin-bottom:5px}.listBadges span,.detailBadges span{font-size:11px;color:#6570dc}.listBadges b,.detailBadges b{font-size:9px;color:#24775c;background:#e6f6ef;border-radius:999px;padding:3px 6px}.detailBadges b.sessionBadge{color:#6d7480;background:#eef0f3}.conversationList small{font-size:10px;color:#929ca5;margin-top:3px}.conversationList p{margin:7px 0 0;color:#6c7882;font-size:12px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.conversationDetail{border:1px solid #e5e9ee;border-radius:14px;background:#fafbfc;padding:18px;min-width:0}.detailHead{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding-bottom:14px;border-bottom:1px solid #e5e9ee}.detailHead h2{margin:5px 0;font-size:20px}.detailHead small{color:#89949d}.detailHead button{padding:9px 12px;white-space:nowrap}.messageStack{display:grid;gap:12px;margin-top:16px}.historyMessage{display:grid;grid-template-columns:38px minmax(0,1fr);gap:10px}.historyMessage>div{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#2f8c71;color:#fff;font-size:11px;font-weight:800}.historyMessage.user>div{background:#667480}.historyMessage section{background:white;border:1px solid #e1e6eb;border-radius:13px;padding:12px 14px}.historyMessage.user section{background:#eef2ff;border-color:#dce2fb}.historyMessage section>span{font-size:10px;color:#7b8790}.historyMessage p{white-space:pre-wrap;line-height:1.65;margin:7px 0;overflow-wrap:anywhere}.historyMessage small{color:#7a8790}.threadComposer{margin-top:18px;border-top:1px solid #e2e7ec;padding-top:16px}.threadComposer>div:first-child strong,.threadComposer>div:first-child span{display:block}.threadComposer>div:first-child span{font-size:11px;color:#7e8993;margin-top:3px}.threadComposer textarea{width:100%;min-height:90px;max-height:230px;resize:vertical;border:1px solid #d9e0e7;border-radius:12px;padding:11px 12px;margin-top:10px;font:inherit;background:#fff}.threadActions{display:flex;justify-content:flex-end;align-items:center;gap:10px;margin-top:8px}.threadActions span{color:#9a514b;font-size:11px}.threadActions button{padding:9px 13px}.threadActions button:disabled{opacity:.45}.historyNote{margin-top:18px;padding:17px 20px;border-left:4px solid #6570dc;background:#eef0ff;border-radius:10px}.historyNote p{margin:5px 0 0;color:#5e6876;line-height:1.65}@media(max-width:860px){.historyWorkspace{grid-template-columns:1fr}.conversationList{max-height:320px}.historyStats{grid-template-columns:1fr 1fr}.historyToolbar{grid-template-columns:1fr}.historyToolbar button{padding:10px}}@media(max-width:520px){.historyPage{padding-inline:14px}.historyStats{grid-template-columns:1fr}.detailHead{flex-direction:column}.detailHead button{width:100%}}
    `}</style>
  </main>;
}
