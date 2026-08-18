"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type HistoryItem = {
  id: string;
  workspace: string;
  workspaceSlug: string;
  role: "user" | "assistant";
  content: string;
  sentAt: number | null;
  sourceCount: number;
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

export default function HistoryPage() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [query, setQuery] = useState("");
  const [workspace, setWorkspace] = useState("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  async function load() {
    setLoading(true);
    setError("");
    try {
      const response = await fetch("/api/history?limit=120", { cache: "no-store" });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "无法读取对话历史。");
      setItems(Array.isArray(data.items) ? data.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "无法读取对话历史。");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => { load(); }, []);

  const workspaces = useMemo(() => Array.from(new Set(items.map((item) => item.workspace))), [items]);
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((item) => {
      if (workspace !== "all" && item.workspace !== workspace) return false;
      if (!q) return true;
      return `${item.workspace} ${item.content}`.toLowerCase().includes(q);
    });
  }, [items, query, workspace]);

  const userCount = items.filter((item) => item.role === "user").length;
  const assistantCount = items.length - userCount;

  return <main className="historyPage">
    <header className="historyTop">
      <Link href="/">← 返回助手</Link>
      <span>CONVERSATION HISTORY · ANYTHINGLLM</span>
    </header>

    <section className="historyHero">
      <span>对话历史</span>
      <h1>查看当前正式 Workspace 的历史消息</h1>
      <p>这里直接读取你当前 AnythingLLM 中、且已在 <code>.env.local</code> 配置的 Workspace 历史。恢复 AnythingLLM 后留下的历史消息也可以在这里查看。</p>
      <div className="historyStats"><article><strong>{items.length}</strong><span>读取到的消息</span></article><article><strong>{userCount}</strong><span>用户消息</span></article><article><strong>{assistantCount}</strong><span>AI 回复</span></article><article><strong>{workspaces.length}</strong><span>Workspace</span></article></div>
    </section>

    <section className="historyPanel">
      <div className="historyToolbar">
        <input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索历史消息或知识库…" />
        <select value={workspace} onChange={(event) => setWorkspace(event.target.value)}><option value="all">全部知识库</option>{workspaces.map((item) => <option key={item}>{item}</option>)}</select>
        <button type="button" onClick={load}>刷新</button>
      </div>

      {loading && <div className="historyEmpty">正在从 AnythingLLM 读取对话历史…</div>}
      {error && <div className="historyError"><strong>暂时无法读取历史记录</strong><p>{error}</p></div>}
      {!loading && !error && !filtered.length && <div className="historyEmpty"><strong>当前筛选条件下没有历史消息。</strong><p>如果这是恢复后的旧 Workspace，但 AnythingLLM 本身没有保存对应聊天记录，这里也不会凭空生成。</p></div>}

      {!loading && !error && filtered.length > 0 && <div className="historyList">{filtered.map((item) => <article key={item.id} className={`historyItem ${item.role}`}>
        <div className="historyAvatar">{item.role === "user" ? "你" : "AI"}</div>
        <div className="historyBody">
          <div className="historyMeta"><span>{item.workspace}</span><span>{formatTime(item.sentAt)}</span>{item.sourceCount > 0 && <span>{item.sourceCount} 个来源</span>}</div>
          <p>{item.content}</p>
        </div>
      </article>)}</div>}
    </section>

    <section className="historyNote">
      <strong>当前实现说明</strong>
      <p>这一版优先解决“看不到历史”的问题，所以采用 AnythingLLM 真实历史作为数据源，而不是仅保存在浏览器 localStorage。下一步可以继续增加“按一次完整问答折叠”“历史会话命名”“继续某个历史会话”等交互。</p>
    </section>

    <style jsx>{`
      .historyPage{min-height:100vh;background:#f6f7fa;padding:0 28px 80px;color:#19232d}.historyTop{height:70px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e3e7ed}.historyTop a{color:#5965d8;text-decoration:none;font-weight:700}.historyTop span,.historyHero>span{font-size:11px;letter-spacing:.13em;color:#6570dc;font-weight:800}.historyHero,.historyPanel,.historyNote{max-width:1050px;margin-left:auto;margin-right:auto}.historyHero{margin-top:48px}.historyHero h1{font-size:34px;margin:9px 0}.historyHero p{color:#697782;line-height:1.7}.historyHero code{background:#eceef3;padding:2px 5px;border-radius:5px}.historyStats{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:22px}.historyStats article{background:#fff;border:1px solid #e1e6ec;border-radius:15px;padding:18px}.historyStats strong{display:block;font-size:28px}.historyStats span{font-size:12px;color:#7a8790}.historyPanel{margin-top:20px;background:#fff;border:1px solid #e0e5eb;border-radius:18px;padding:20px}.historyToolbar{display:grid;grid-template-columns:minmax(0,1fr) 220px auto;gap:10px}.historyToolbar input,.historyToolbar select{border:1px solid #d9e0e7;border-radius:10px;padding:10px 12px;background:#fff;font:inherit}.historyToolbar button{border:0;border-radius:10px;background:#5a63e7;color:#fff;padding:0 16px;font-weight:700;cursor:pointer}.historyList{display:grid;gap:12px;margin-top:18px}.historyItem{display:grid;grid-template-columns:42px minmax(0,1fr);gap:10px;align-items:flex-start}.historyAvatar{width:36px;height:36px;border-radius:50%;display:grid;place-items:center;background:#2f8c71;color:#fff;font-size:12px;font-weight:800}.historyItem.user .historyAvatar{background:#667480}.historyBody{border:1px solid #e2e7eb;border-radius:14px;padding:12px 14px;background:#fbfcfd}.historyItem.user .historyBody{background:#eef2ff;border-color:#dce2fb}.historyBody p{margin:8px 0 0;line-height:1.65;white-space:pre-wrap}.historyMeta{display:flex;gap:7px;flex-wrap:wrap}.historyMeta span{font-size:10px;color:#71808b;background:#f0f3f5;border-radius:999px;padding:3px 7px}.historyEmpty,.historyError{margin-top:18px;padding:32px;text-align:center;border-radius:14px;background:#f8f9fb;color:#7b8791}.historyError{background:#fff5f4;color:#92544f}.historyEmpty strong,.historyError strong{display:block;color:#4c5963}.historyEmpty p,.historyError p{margin-bottom:0}.historyNote{margin-top:18px;padding:17px 20px;border-left:4px solid #6570dc;background:#eef0ff;border-radius:10px}.historyNote p{margin:5px 0 0;color:#5e6876;line-height:1.65}@media(max-width:760px){.historyStats{grid-template-columns:1fr 1fr}.historyToolbar{grid-template-columns:1fr}.historyToolbar button{padding:10px}.historyPage{padding-inline:14px}}
    `}</style>
  </main>;
}
