"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type Workspace = { label: string; slug: string; name?: string };
type SourceStatus = {
  account: string;
  count: number;
  synced: number;
  processed: number;
  pending_workspace: number;
  failed: number;
  workspace?: string | null;
  workspaceExists?: boolean;
  approved?: boolean;
};
type SyncStatus = {
  connected?: boolean;
  configured?: boolean;
  root?: string;
  total?: number;
  status?: Record<string, number>;
  accounts?: Array<{ account: string; count: number; processed?: number; synced?: number; pending_workspace?: number; failed?: number }>;
  unclassified?: number;
  last_run?: {
    started_at?: string;
    finished_at?: string;
    scanned?: number;
    created?: number;
    updated?: number;
    unchanged?: number;
    failed?: number;
    note?: string;
  } | null;
  phase2?: {
    allWorkspace?: string | null;
    allWorkspaceExists?: boolean;
    liveWorkspaceCount?: number;
    sources?: SourceStatus[];
  } | null;
  phase2Warning?: string;
  message?: string;
};

function value(status: SyncStatus, key: string) {
  return status.status?.[key] || 0;
}

export default function KnowledgeBasePage() {
  const [workspaces, setWorkspaces] = useState<Workspace[]>([]);
  const [staleCount, setStaleCount] = useState(0);
  const [sync, setSync] = useState<SyncStatus>({});
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const [configResult, syncResult] = await Promise.allSettled([
      fetch("/api/config", { cache: "no-store" }).then((response) => response.json()),
      fetch("/api/server-sync/status", { cache: "no-store" }).then((response) => response.json()),
    ]);

    if (configResult.status === "fulfilled") {
      setWorkspaces(Array.isArray(configResult.value.workspaces) ? configResult.value.workspaces : []);
      setStaleCount(Array.isArray(configResult.value.staleConfigured) ? configResult.value.staleConfigured.length : 0);
    }
    if (syncResult.status === "fulfilled") setSync(syncResult.value || {});
    setLoading(false);
  }

  useEffect(() => { load(); }, []);

  const phase2Sources = sync.phase2?.sources || [];
  const pendingSources = phase2Sources.filter((source) => !source.approved || !source.workspaceExists || source.account === "未分类");

  return <main className="kbPage">
    <header className="kbTop"><Link href="/">← 返回助手</Link><span>KNOWLEDGE BASE MANAGEMENT</span></header>

    <section className="kbHero">
      <span>知识库管理</span>
      <h1>正式 Workspace、公众号来源与服务器文章同步中心</h1>
      <p>AnythingLLM Workspace 负责检索；服务器文章仓库负责新增、更新、去重与来源识别。Phase 2 只同步“已明确来源 + 已批准 Workspace 映射”的文章，不再自动创建一批未知 Workspace。</p>
      <div className="kbActions"><button type="button" onClick={load}>刷新状态</button><Link href="/dashboard">查看数据看板 →</Link></div>
    </section>

    <section className="metricGrid">
      <article><small>正式 Workspace</small><strong>{loading ? "…" : workspaces.length}</strong><span>.env.local 配置并经 AnythingLLM 校验</span></article>
      <article><small>服务器文章</small><strong>{sync.connected ? (sync.total ?? 0) : "—"}</strong><span>{sync.connected ? "SQLite articles.db" : "尚未接入当前运行环境"}</span></article>
      <article><small>待导入 AnythingLLM</small><strong>{sync.connected ? value(sync, "processed") : "—"}</strong><span>Phase 2 的主要输入</span></article>
      <article><small>待确认公众号</small><strong>{sync.connected ? pendingSources.length : "—"}</strong><span>未分类、未映射或 Workspace 不存在</span></article>
    </section>

    <section className="kbPanel">
      <div className="panelHead"><div><span>ANYTHINGLLM</span><h2>正式知识库</h2></div><strong>{workspaces.length} 个</strong></div>
      {staleCount > 0 && <div className="notice warning">已自动隐藏 {staleCount} 个在恢复后的 AnythingLLM 中已不存在的旧 Workspace 配置。</div>}
      {!workspaces.length && !loading ? <div className="empty">当前没有可用 Workspace。请检查 AnythingLLM 与 <code>ANYTHINGLLM_WORKSPACES</code>。</div> : <div className="workspaceGrid">{workspaces.map((item) => <article key={item.slug}><div className="workspaceIcon">KB</div><div><strong>{item.label}</strong><span>{item.slug}</span>{item.name && item.name !== item.label && <small>AnythingLLM 名称：{item.name}</small>}</div><i>已连接</i></article>)}</div>}
    </section>

    <section className="kbPanel">
      <div className="panelHead"><div><span>SOURCE REGISTRY</span><h2>公众号来源识别与 Workspace 映射</h2></div><strong>{phase2Sources.length || sync.accounts?.length || 0} 个来源</strong></div>
      <div className="sourceRule">
        <strong>文章可以全部放在同一个 incoming 文件夹。</strong>
        <p>系统优先读取文章中的 <code>source_account</code>；没有该字段时才使用 <code>incoming/&lt;公众号&gt;/文件</code> 的文件夹名；两者都没有就标记为“未分类”，不会猜测来源。</p>
      </div>

      {!sync.connected ? <div className="empty">服务器状态尚未连接，部署到 ECS 后这里会自动列出检测到的公众号。</div> : phase2Sources.length ? <div className="sourceTable">
        <div className="sourceRow head"><span>公众号</span><span>文章</span><span>Workspace</span><span>状态</span></div>
        {phase2Sources.map((source) => <div className="sourceRow" key={source.account}>
          <strong>{source.account}</strong>
          <span>{source.count}</span>
          <code>{source.workspace || "未映射"}</code>
          <i className={source.approved && source.workspaceExists && source.account !== "未分类" ? "ok" : "pending"}>{source.account === "未分类" ? "需补来源" : !source.approved ? "待新增映射" : !source.workspaceExists ? "Workspace 不存在" : "可同步"}</i>
        </div>)}
      </div> : <div className="empty">暂未读取到公众号来源。先执行 Phase 1 扫描后再刷新。</div>}

      <div className="howToAdd">
        <h3>遇到新的公众号怎么新增？</h3>
        <ol>
          <li>先确认文章中的 <code>source_account</code> 是正确公众号名。</li>
          <li>在 AnythingLLM 中手动创建或确认该公众号的 Workspace，避免再次自动生成大量错误 Workspace。</li>
          <li>把新映射加入 <code>ANYTHINGLLM_WORKSPACES</code>，例如：<code>&quot;西浦就业CareerCentre&quot;:&quot;xjtlu-careercentre&quot;</code>。</li>
          <li>运行 <code>npm run sync:anythingllm:discover</code> 检查，再用 dry-run，确认后才真正同步。</li>
        </ol>
      </div>

      {sync.phase2?.allWorkspace && <div className={`notice ${sync.phase2.allWorkspaceExists ? "success" : "warning"}`}><strong>跨公众号总库：</strong> {sync.phase2.allWorkspace} · {sync.phase2.allWorkspaceExists ? "存在。每篇已批准文章会同时进入来源 Workspace + 总库。" : "当前 AnythingLLM 中未找到该总库，所以 Phase 2 暂时只同步来源 Workspace。"}</div>}
      {sync.phase2Warning && <div className="notice warning">Phase 2 状态暂不可用：{sync.phase2Warning}</div>}
    </section>

    <section className="kbPanel">
      <div className="panelHead"><div><span>SERVER ARTICLE REPOSITORY</span><h2>服务器文章仓库</h2></div><strong className={sync.connected ? "ok" : "muted"}>{sync.connected ? "已连接" : "未连接"}</strong></div>

      {!sync.connected ? <div className="serverSetup">
        <div className="notice"><strong>当前 Demo 还没有读取到服务器文章状态。</strong><p>{sync.message || "本机开发环境尚未配置服务器文章目录。"}</p></div>
        <p>部署到华为云 ECS 后，在项目环境变量中增加：</p>
        <pre>XJTLU_CONTENT_ROOT=/mnt/sdd/xjtlu-content</pre>
        <p>然后先执行：</p>
        <pre>{`npm run sync:server:init\nnpm run sync:server\nnpm run sync:server:status`}</pre>
      </div> : <>
        <div className="repoPath"><span>仓库路径</span><code>{sync.root}</code></div>
        <div className="statusGrid">
          <article><span>processed</span><strong>{value(sync, "processed")}</strong><small>已标准化，等待 AnythingLLM</small></article>
          <article><span>synced</span><strong>{value(sync, "synced")}</strong><small>已进入 AnythingLLM</small></article>
          <article><span>pending_workspace</span><strong>{value(sync, "pending_workspace")}</strong><small>等待来源/Workspace 确认</small></article>
          <article><span>failed</span><strong>{value(sync, "failed")}</strong><small>上传失败，允许重试</small></article>
        </div>
        <div className="lastRun">
          <div><span>最近一次扫描</span><strong>{sync.last_run?.finished_at || sync.last_run?.started_at || "暂无记录"}</strong></div>
          <div><span>扫描文件</span><strong>{sync.last_run?.scanned ?? 0}</strong></div>
          <div><span>新增</span><strong>{sync.last_run?.created ?? 0}</strong></div>
          <div><span>更新</span><strong>{sync.last_run?.updated ?? 0}</strong></div>
          <div><span>无变化</span><strong>{sync.last_run?.unchanged ?? 0}</strong></div>
          <div><span>失败</span><strong>{sync.last_run?.failed ?? 0}</strong></div>
        </div>
      </>}
    </section>

    <section className="kbPanel">
      <div className="panelHead"><div><span>PHASE 2</span><h2>服务器 → AnythingLLM 增量同步</h2></div><strong>已加入仓库</strong></div>
      <div className="pipeline"><b>processed</b><i>→</i><b>来源识别</b><i>→</i><b>Workspace 校验</b><i>→</i><b>AnythingLLM raw-text API</b><i>→</i><b className="future">synced</b></div>
      <pre>{`npm run sync:anythingllm:discover\nnpm run sync:anythingllm:dry-run\nnpm run sync:anythingllm\nnpm run sync:anythingllm:retry\nnpm run sync:anythingllm:status`}</pre>
      <p>Phase 2 不会自动创建 Workspace。新来源会停在 <code>pending_workspace</code>，直到你人工确认并在 <code>ANYTHINGLLM_WORKSPACES</code> 中加入映射。这样可以避免之前“发现一个来源就创建一个 Workspace”导致的混乱。</p>
    </section>

    <style jsx>{`
      .kbPage{min-height:100vh;background:#f6f7fa;padding:0 28px 80px;color:#19232d}.kbTop{height:70px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e3e7ed}.kbTop a,.kbActions a{color:#5965d8;text-decoration:none;font-weight:700}.kbTop span,.kbHero>span,.panelHead span{font-size:11px;letter-spacing:.13em;color:#6570dc;font-weight:800}.kbHero,.metricGrid,.kbPanel{max-width:1080px;margin-left:auto;margin-right:auto}.kbHero{margin-top:48px}.kbHero h1{font-size:34px;margin:9px 0}.kbHero p{color:#697782;line-height:1.7}.kbActions{display:flex;gap:12px;align-items:center;margin-top:18px}.kbActions button{border:0;border-radius:10px;background:#5a63e7;color:white;padding:10px 15px;font-weight:700;cursor:pointer}.metricGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px;margin-top:24px}.metricGrid article,.kbPanel{background:#fff;border:1px solid #e1e6ec;border-radius:16px}.metricGrid article{padding:18px}.metricGrid small,.metricGrid span{display:block;color:#7a8790}.metricGrid strong{display:block;font-size:28px;margin:8px 0}.metricGrid span{font-size:12px}.kbPanel{margin-top:18px;padding:22px}.panelHead{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.panelHead h2{margin:5px 0 14px}.panelHead>strong{font-size:12px;color:#5d68d5;background:#eef0ff;border-radius:999px;padding:6px 9px}.panelHead>strong.ok{color:#26795c;background:#e9f7f1}.panelHead>strong.muted{color:#7a8790;background:#f1f3f5}.notice{padding:13px 15px;background:#eef0ff;border-left:4px solid #6570dc;border-radius:9px;color:#5d6874;margin-top:12px}.notice.success{background:#e9f7f1;border-left-color:#52a17d}.notice.warning{background:#fff6e8;border-left-color:#d29a45;color:#7f663e}.notice p{margin:4px 0 0}.workspaceGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.workspaceGrid article{display:grid;grid-template-columns:44px minmax(0,1fr) auto;gap:11px;align-items:center;border:1px solid #e3e7ec;border-radius:13px;padding:13px}.workspaceIcon{width:40px;height:40px;border-radius:11px;background:#eef0ff;color:#5863d7;display:grid;place-items:center;font-size:11px;font-weight:900}.workspaceGrid strong,.workspaceGrid span,.workspaceGrid small{display:block}.workspaceGrid span{font-size:11px;color:#7d8993;margin-top:3px;word-break:break-all}.workspaceGrid small{font-size:10px;color:#9aa3ab;margin-top:3px}.workspaceGrid i{font-style:normal;font-size:11px;color:#2d8566;background:#e9f7f1;padding:5px 7px;border-radius:999px}.sourceRule{background:#f8f9fb;border-radius:12px;padding:14px 16px;color:#5e6974}.sourceRule p{margin:5px 0 0;line-height:1.65}.sourceRule code,.howToAdd code,.kbPanel code{background:#eceff3;padding:2px 5px;border-radius:5px}.sourceTable{margin-top:14px;border:1px solid #e3e7ec;border-radius:12px;overflow:hidden}.sourceRow{display:grid;grid-template-columns:minmax(180px,1.6fr) 80px minmax(180px,1fr) 130px;gap:12px;align-items:center;padding:11px 13px;border-top:1px solid #edf0f3}.sourceRow:first-child{border-top:0}.sourceRow.head{background:#f7f8fb;font-size:11px;color:#7b8791}.sourceRow code{font-size:11px;word-break:break-all}.sourceRow i{font-style:normal;font-size:11px;border-radius:999px;padding:5px 8px;justify-self:start}.sourceRow i.ok{color:#26795c;background:#e9f7f1}.sourceRow i.pending{color:#8a6530;background:#fff4df}.howToAdd{margin-top:16px;padding:16px;border:1px dashed #d8dee8;border-radius:12px}.howToAdd h3{margin:0 0 9px}.howToAdd ol{margin:0;padding-left:20px;color:#65727d;line-height:1.75}.empty{padding:28px;text-align:center;background:#f8f9fb;border-radius:12px;color:#78848e}.serverSetup p{color:#687681}.serverSetup pre,.repoPath code,.kbPanel>pre{background:#f6f8fa;border:1px solid #e2e6eb;border-radius:10px;padding:12px;white-space:pre-wrap}.repoPath{display:flex;gap:10px;align-items:center;margin-bottom:14px}.repoPath span{font-size:12px;color:#7d8993}.repoPath code{padding:7px 9px}.statusGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:10px}.statusGrid article{background:#f8f9fb;border-radius:12px;padding:14px}.statusGrid span,.statusGrid small{display:block}.statusGrid span{font-size:11px;color:#6974d9}.statusGrid strong{display:block;font-size:24px;margin:5px 0}.statusGrid small{font-size:11px;color:#87919a}.lastRun{display:grid;grid-template-columns:2fr repeat(5,1fr);gap:8px;margin-top:12px}.lastRun>div{border:1px solid #e4e8ed;border-radius:10px;padding:10px}.lastRun span,.lastRun strong{display:block}.lastRun span{font-size:10px;color:#87919a}.lastRun strong{font-size:13px;margin-top:4px}.pipeline{display:flex;align-items:center;gap:9px;flex-wrap:wrap}.pipeline b{background:#eef0ff;color:#5260ce;padding:9px 11px;border-radius:10px}.pipeline b.future{background:#e9f7f1;color:#26795c}.pipeline i{font-style:normal;color:#9ba4ad}.kbPanel>p{color:#6d7983;line-height:1.7}@media(max-width:820px){.metricGrid,.statusGrid,.workspaceGrid{grid-template-columns:1fr 1fr}.lastRun{grid-template-columns:1fr 1fr 1fr}.sourceRow{grid-template-columns:1fr 70px}.sourceRow code,.sourceRow i{grid-column:auto}}@media(max-width:520px){.kbPage{padding-inline:14px}.metricGrid,.statusGrid,.workspaceGrid,.lastRun{grid-template-columns:1fr}.kbActions{align-items:stretch;flex-direction:column}.kbActions button{width:100%}.sourceRow{grid-template-columns:1fr}.sourceRow.head{display:none}}
    `}</style>
  </main>;
}
