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
  toolType?: "file-fill";
  apiSessionId?: string;
};

function formatTime(value: number | null) {
  if (!value) return "时间未记录";
  return new Intl.DateTimeFormat("zh-CN", {
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).format(new Date(value));
}

function toolConversation(entry: ToolHistoryEntry): Conversation {
  const chatId = `tool:${entry.id}`;
  return {
    id: chatId,
    chatId,
    workspace: entry.workspace,
    workspaceSlug: entry.workspaceSlug,
    title: entry.inputName,
    preview: `文件填写 · 已生成 ${entry.outputName} · ${entry.fieldCount} 个字段`,
    sentAt: entry.createdAt,
    sourceCount: 0,
    kind: "tool",
    toolType: entry.tool,
    apiSessionId: entry.sessionId,
    messages: [
      {
        id: `${chatId}:user`,
        chatId,
        workspace: entry.workspace,
        workspaceSlug: entry.workspaceSlug,
        role: "user",
        content: `文件填写：${entry.inputName}\n${entry.instruction}`,
        sentAt: entry.createdAt,
        sourceCount: 0,
      },
      {
        id: `${chatId}:assistant`,
        chatId,
        workspace: entry.workspace,
        workspaceSlug: entry.workspaceSlug,
        role: "assistant",
        content: `已生成 ${entry.outputName}，按确认范围处理 ${entry.fieldCount} 个字段。`,
        sentAt: entry.createdAt,
        sourceCount: 0,
      },
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
  const [sessionCount, setSessionCount] = useState(0);

  async function load() {
    setLoading(true);
    setError("");
    try {
      const ids = getStoredClientIds();
      const toolItems = getToolHistory().map(toolConversation);
      setSessionCount(ids.length);

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
  const toolCount = conversations.filter((item) => item.kind === "tool").length;

  function bringBackQuestion() {
    const question = selected?.messages.find((item) => item.role === "user")?.content;
    if (!question || !selected) return;
    localStorage.setItem("xjtlu-history-prefill", JSON.stringify({ message: question, workspaceSlug: selected.workspaceSlug }));
    window.location.href = "/";
  }

  return <main className="historyPage">
    <header className="historyTop"><Link href="/">← 返回助手</Link><span>PRIVATE HISTORY · CURRENT BROWSER</span></header>

    <section className="historyHero">
      <span>我的对话历史</span>
      <h1>只显示当前用户在本浏览器产生的 Demo 对话与工具记录</h1>
      <p>这一版不再枚举 AnythingLLM 中所有 Workspace 的全局聊天记录。Demo 会记住当前浏览器最近使用的 API sessionId，并只按这些 sessionId 向 AnythingLLM 查询历史；文件填写等本地工具操作也只记录在当前浏览器，因此其他测试用户的内容不会出现在这里。</p>
      <div className="privacyNotice"><strong>当前属于“匿名浏览器级隔离”</strong><p>适合现阶段用户测试：不同设备或不同浏览器配置会看到各自的历史。它不是正式账号登录；如果同一台电脑共用同一浏览器配置，仍会共享历史。正式多人版本建议接 Supabase Auth 或学校统一身份认证。</p></div>
      <div className="historyStats"><article><strong>{conversations.length}</strong><span>我的历史记录</span></article><article><strong>{messageCount}</strong><span>历史消息</span></article><article><strong>{sessionCount}</strong><span>本机 Session</span></article><article><strong>{toolCount}</strong><span>工具操作</span></article></div>
    </section>

    <section className="historyPanel">
      <div className="historyToolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索我的问题、回答、工具记录或知识库…" />
        <select value={workspace} onChange={(event) => { setWorkspace(event.target.value); setSelectedId(""); }}><option value="all">全部知识库</option>{workspaces.map((item) => <option key={item}>{item}</option>)}</select>
        <button type="button" onClick={load}>刷新</button>
      </div>

      {loading && <div className="historyEmpty">正在读取当前浏览器用户的 AnythingLLM 历史与工具记录…</div>}
      {error && <div className="historyError"><strong>暂时无法读取历史记录</strong><p>{error}</p></div>}
      {!loading && !error && !filtered.length && <div className="historyEmpty"><strong>当前用户还没有可显示的历史记录。</strong><p>更新到这一版之后的新对话会自动记录 sessionId，文件填写成功后也会记录为工具操作。为了保护测试用户隐私，旧的全局 AnythingLLM Thread/聊天不会再自动展示。</p></div>}

      {!loading && !error && filtered.length > 0 && <div className="historyWorkspace">
        <aside className="conversationList">{filtered.map((item) => <button key={item.id} className={selected?.id === item.id ? "active" : ""} onClick={() => setSelectedId(item.id)}>
          <div className="listBadges"><span>{item.workspace}</span><b>{item.kind === "tool" ? "文件填写" : "我的会话"}</b></div>
          <strong>{item.title}</strong>
          <small>{formatTime(item.sentAt)}</small>
          <p>{item.preview}</p>
        </button>)}</aside>

        <section className="conversationDetail">
          {selected && <>
            <div className="detailHead"><div><div className="detailBadges"><span>{selected.workspace}</span><b>{selected.kind === "tool" ? "浏览器私有工具记录" : "浏览器私有历史"}</b></div><h2>{selected.title}</h2><small>{formatTime(selected.sentAt)} · {selected.messages.length} 条记录 · {selected.sourceCount} 个来源</small></div><button type="button" onClick={bringBackQuestion}>{selected.kind === "tool" ? "带回助手" : "带回输入框"}</button></div>
            <div className="messageStack">{selected.messages.map((item) => <article key={item.id} className={`historyMessage ${item.role}`}>
              <div>{item.role === "user" ? "你" : "AI"}</div>
              <section><span>{item.role === "user" ? "用户" : "AI"}</span><p>{item.content}</p>{item.sourceCount > 0 && <small>{item.sourceCount} 个来源</small>}</section>
            </article>)}</div>
          </>}
        </section>
      </div>}
    </section>

    <section className="historyNote"><strong>为什么现在看不到以前所有 AnythingLLM Thread？</strong><p>这是有意修改。以前读取“所有 Thread/所有 API 会话”会让不同测试用户看到彼此的历史，不适合作为用户测试 Demo。当前先按本浏览器 sessionId 隔离；本地工具操作也只保存在本浏览器。等加入账号系统后，再把“真正可续聊的 Thread”和工具记录绑定到登录用户。</p></section>

    <style jsx>{`
      .historyPage{min-height:100vh;background:#f6f7fa;padding:0 28px 80px;color:#19232d}.historyTop{height:70px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e3e7ed}.historyTop a{color:#5965d8;text-decoration:none;font-weight:700}.historyTop span,.historyHero>span{font-size:11px;letter-spacing:.13em;color:#6570dc;font-weight:800}.historyHero,.historyPanel,.historyNote{max-width:1120px;margin-left:auto;margin-right:auto}.historyHero{margin-top:48px}.historyHero h1{font-size:34px;margin:9px 0}.historyHero>p{color:#697782;line-height:1.7}.privacyNotice{margin-top:16px;padding:14px 16px;border-left:4px solid #2e9b72;background:#ecf8f3;border-radius:10px}.privacyNotice p{margin:5px 0 0;color:#526d63;line-height:1.65}.historyStats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:22px}.historyStats article{background:#fff;border:1px solid #e1e6ec;border-radius:15px;padding:18px}.historyStats strong{display:block;font-size:28px}.historyStats span{font-size:12px;color:#7a8790}.historyPanel{margin-top:20px;background:#fff;border:1px solid #e0e5eb;border-radius:18px;padding:20px}.historyToolbar{display:grid;grid-template-columns:minmax(0,1fr) 220px auto;gap:10px}.historyToolbar input,.historyToolbar select{border:1px solid #d9e0e7;border-radius:10px;padding:10px 12px;background:#fff;font:inherit}.historyToolbar button,.detailHead button{border:0;border-radius:10px;background:#5a63e7;color:#fff;padding:0 16px;font-weight:700;cursor:pointer}.historyEmpty,.historyError{margin-top:18px;padding:32px;text-align:center;border-radius:14px;background:#f8f9fb;color:#7b8791}.historyError{background:#fff5f4;color:#92544f}.historyWorkspace{display:grid;grid-template-columns:320px minmax(0,1fr);gap:14px;margin-top:18px;min-height:500px}.conversationList{display:flex;flex-direction:column;gap:8px;max-height:680px;overflow:auto;padding-right:4px}.conversationList button{text-align:left;border:1px solid #e2e7ec;background:#fbfcfd;border-radius:13px;padding:12px;cursor:pointer;color:#23303a}.conversationList button.active{border-color:#8c94ed;background:#f0f1ff;box-shadow:0 0 0 2px #eceeff}.conversationList strong,.conversationList small,.conversationList p{display:block}.listBadges,.detailBadges{display:flex;gap:6px;align-items:center;margin-bottom:5px}.listBadges span,.detailBadges span{font-size:11px;color:#6570dc}.listBadges b,.detailBadges b{font-size:9px;color:#24775c;background:#e6f6ef;border-radius:999px;padding:3px 6px}.conversationList small{font-size:10px;color:#929ca5;margin-top:3px}.conversationList p{margin:7px 0 0;color:#6c7882;font-size:12px;line-height:1.45;display:-webkit-box;-webkit-line-clamp:2;-webkit-box-orient:vertical;overflow:hidden}.conversationDetail{border:1px solid #e5e9ee;border-radius:14px;background:#fafbfc;padding:18px;min-width:0}.detailHead{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;padding-bottom:14px;border-bottom:1px solid #e5e9ee}.detailHead h2{margin:5px 0;font-size:20px}.detailHead small{color:#89949d}.detailHead button{padding:9px 12px;white-space:nowrap}.messageStack{display:grid;gap:12px;margin-top:16px}.historyMessage{display:grid;grid-template-columns:38px minmax(0,1fr);gap:10px}.historyMessage>div{width:34px;height:34px;border-radius:50%;display:grid;place-items:center;background:#2f8c71;color:#fff;font-size:11px;font-weight:800}.historyMessage.user>div{background:#667480}.historyMessage section{background:white;border:1px solid #e1e6eb;border-radius:13px;padding:12px 14px}.historyMessage.user section{background:#eef2ff;border-color:#dce2fb}.historyMessage section>span{font-size:10px;color:#7b8790}.historyMessage p{white-space:pre-wrap;line-height:1.65;margin:7px 0;overflow-wrap:anywhere}.historyMessage small{color:#7a8790}.historyNote{margin-top:18px;padding:17px 20px;border-left:4px solid #6570dc;background:#eef0ff;border-radius:10px}.historyNote p{margin:5px 0 0;color:#5e6876;line-height:1.65}@media(max-width:860px){.historyWorkspace{grid-template-columns:1fr}.conversationList{max-height:320px}.historyStats{grid-template-columns:1fr 1fr}.historyToolbar{grid-template-columns:1fr}.historyToolbar button{padding:10px}}@media(max-width:520px){.historyPage{padding-inline:14px}.historyStats{grid-template-columns:1fr}.detailHead{flex-direction:column}.detailHead button{width:100%}}
    `}</style>
  </main>;
}
