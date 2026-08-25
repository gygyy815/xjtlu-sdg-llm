"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type Workspace = { label: string; slug: string; name?: string };

export default function KnowledgeBasePage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  useEffect(() => {
    fetch("/api/config", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        setWorkspaces(Array.isArray(data.workspaces) ? data.workspaces : []);
        setError(data.warning || "");
      })
      .catch(() => setError("暂时无法读取知识库列表。"))
      .finally(() => setLoading(false));
  }, []);

  const filtered = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    if (!normalized) return workspaces;
    return workspaces.filter((item) => `${item.label} ${item.name || ""} ${item.slug}`.toLowerCase().includes(normalized));
  }, [query, workspaces]);

  function useWorkspace(item: Workspace) {
    localStorage.setItem("xjtlu-history-prefill", JSON.stringify({ workspaceSlug: item.slug, message: "" }));
    window.location.href = "/";
  }

  return <main className="kbPage userKnowledgePage">
    <header className="kbTop"><Link href="/">← 返回助手</Link><span>选择知识库</span></header>

    <section className="kbHero">
      <span>校园知识库</span>
      <h1>搜索并选择你想查询的知识库</h1>
      <p>你可以按公众号名称、部门名称或 Workspace 名称搜索。选择后，助手会优先使用该知识库回答问题。</p>
    </section>

    <section className="kbSearchPanel">
      <div className="searchBox"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder="搜索知识库，例如：图书馆、学生服务、全部公众号…" /></div>
      <div className="kbCount">{loading ? "正在读取…" : `共 ${workspaces.length} 个知识库`}</div>
    </section>

    {error && <div className="kbNotice">{error}</div>}
    {!loading && !filtered.length && <div className="kbEmpty">没有找到匹配的知识库。</div>}

    <section className="workspaceGrid">
      {filtered.map((item) => <button type="button" key={item.slug} onClick={() => useWorkspace(item)}>
        <div className="workspaceIcon">KB</div>
        <div className="workspaceCopy"><strong>{item.label}</strong>{item.name && item.name !== item.label && <span>{item.name}</span>}<small>{item.slug}</small></div>
        <i>选择 →</i>
      </button>)}
    </section>

    <section className="kbHelp"><strong>不知道选哪个？</strong><p>选择“全部公众号”可以进行跨来源搜索；如果你只关心某个部门或公众号，选择对应知识库通常会更精准。</p><Link href="/">返回助手直接提问 →</Link></section>

    <style jsx>{`
      .kbPage{min-height:100vh;background:#f7faf8;padding:0 28px 80px;color:#20382f}.kbTop{height:72px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dfe8e3}.kbTop a{color:#2f755d;text-decoration:none;font-weight:750}.kbTop span,.kbHero>span{font-size:12px;letter-spacing:.12em;color:#4d806b;font-weight:800}.kbHero,.kbSearchPanel,.workspaceGrid,.kbHelp,.kbNotice,.kbEmpty{max-width:1080px;margin-left:auto;margin-right:auto}.kbHero{margin-top:54px}.kbHero h1{font-size:40px;line-height:1.18;margin:9px 0;color:#20382f}.kbHero p{max-width:760px;color:#6d7e76;line-height:1.75}.kbSearchPanel{display:flex;align-items:center;gap:16px;margin-top:28px}.searchBox{flex:1;display:flex;align-items:center;gap:10px;background:#fff;border:1px solid #d8e6df;border-radius:15px;padding:0 16px;box-shadow:0 8px 24px rgba(36,95,76,.05)}.searchBox span{font-size:20px;color:#5d8d78}.searchBox input{width:100%;height:54px;border:0;outline:0;background:transparent;font:inherit;font-size:15px;color:#29483c}.kbCount{white-space:nowrap;color:#667a70;font-size:13px}.workspaceGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px;margin-top:22px}.workspaceGrid button{display:grid;grid-template-columns:50px minmax(0,1fr) auto;align-items:center;gap:14px;text-align:left;border:1px solid #dfe8e3;background:#fff;border-radius:16px;padding:16px;cursor:pointer;color:#20382f;box-shadow:0 8px 24px rgba(36,95,76,.04);transition:.15s ease}.workspaceGrid button:hover{border-color:#a9cfbc;background:#f8fcfa;transform:translateY(-1px)}.workspaceIcon{display:grid;place-items:center;width:50px;height:50px;border-radius:14px;background:#eaf4ef;color:#2f755d;font-weight:850}.workspaceCopy strong,.workspaceCopy span,.workspaceCopy small{display:block}.workspaceCopy strong{font-size:16px}.workspaceCopy span{margin-top:3px;color:#61766c;font-size:13px}.workspaceCopy small{margin-top:4px;color:#91a098;font-size:11px}.workspaceGrid i{font-style:normal;color:#2f755d;font-weight:750}.kbNotice,.kbEmpty{margin-top:18px;padding:14px 16px;border-radius:12px;background:#eef7f2;color:#557065}.kbHelp{margin-top:24px;padding:20px 22px;border:1px solid #dfe8e3;border-radius:16px;background:#fff}.kbHelp p{color:#6d7e76;line-height:1.7}.kbHelp a{color:#2f755d;text-decoration:none;font-weight:750}@media(max-width:760px){.kbPage{padding-inline:14px}.workspaceGrid{grid-template-columns:1fr}.kbSearchPanel{align-items:stretch;flex-direction:column}.kbHero h1{font-size:32px}}
    `}</style>
  </main>;
}
