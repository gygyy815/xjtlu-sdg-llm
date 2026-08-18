"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

type SyncStatus = {
  connected?: boolean;
  total?: number;
  status?: Record<string, number>;
  last_run?: { finished_at?: string; started_at?: string; failed?: number } | null;
};

export default function DashboardPage() {
  const [workspaceCount, setWorkspaceCount] = useState<number | null>(null);
  const [conversationCount, setConversationCount] = useState<number | null>(null);
  const [customSkillCount, setCustomSkillCount] = useState(0);
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [surveyCount, setSurveyCount] = useState(0);
  const [sync, setSync] = useState<SyncStatus>({});

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((data) => setWorkspaceCount(Array.isArray(data.accounts) ? data.accounts.length : 0)).catch(() => setWorkspaceCount(0));
    fetch("/api/history?limit=250").then((r) => r.json()).then((data) => setConversationCount(Number(data.conversationCount || 0))).catch(() => setConversationCount(0));
    fetch("/api/server-sync/status").then((r) => r.json()).then((data) => setSync(data || {})).catch(() => setSync({ connected: false }));
    try {
      const parsed = JSON.parse(localStorage.getItem("xjtlu-custom-skills-v1") || "[]");
      setCustomSkillCount(Array.isArray(parsed) ? parsed.length : 0);
      const feedback = JSON.parse(localStorage.getItem("xjtlu-feedback-v2") || "[]");
      const survey = JSON.parse(localStorage.getItem("xjtlu-prototype-survey-e-v1") || "[]");
      setFeedbackCount(Array.isArray(feedback) ? feedback.length : 0);
      setSurveyCount(Array.isArray(survey) ? survey.length : 0);
    } catch {}
  }, []);

  const processed = sync.status?.processed || 0;
  const synced = sync.status?.synced || 0;
  const failed = sync.status?.failed || 0;
  const lastRun = sync.last_run?.finished_at || sync.last_run?.started_at || "暂无";

  return <main className="managementPage">
    <header className="managementTop"><Link href="/">← 返回助手</Link><span>DATA DASHBOARD · BETA</span></header>
    <section className="managementHero"><span>数据看板</span><h1>系统运行状态与知识库概览</h1><p>当前只展示可以从 AnythingLLM、服务器状态库或浏览器本地可靠读取的数据；Token usage 仍不使用估算值。</p></section>

    <section className="metricGrid">
      <article><small>正式 Workspace</small><strong>{workspaceCount ?? "…"}</strong><span>当前 AnythingLLM</span></article>
      <article><small>历史问答</small><strong>{conversationCount ?? "…"}</strong><span>按 chatId 配对</span></article>
      <article><small>服务器文章</small><strong>{sync.connected ? (sync.total ?? 0) : "—"}</strong><span>{sync.connected ? "articles.db" : "尚未接入服务器状态"}</span></article>
      <article><small>反馈 / 原型问卷</small><strong>{feedbackCount + surveyCount}</strong><span>{feedbackCount} 条反馈 · {surveyCount} 份问卷</span></article>
      <article><small>自定义技能</small><strong>{customSkillCount}</strong><span>创建 / 导入</span></article>
      <article><small>待导入 AnythingLLM</small><strong>{sync.connected ? processed : "—"}</strong><span>processed</span></article>
      <article><small>同步失败</small><strong>{sync.connected ? failed : "—"}</strong><span>failed</span></article>
      <article><small>Token 统计</small><strong>待接入</strong><span>不使用估算数据</span></article>
    </section>

    <section className="dashboardPanel">
      <div className="panelHeader"><div><span>SYNC PIPELINE</span><h2>文章同步状态</h2></div><Link href="/knowledge-base">知识库管理 →</Link></div>
      {sync.connected ? <>
        <div className="syncMetrics"><article><small>processed</small><strong>{processed}</strong><span>等待 AnythingLLM</span></article><article><small>synced</small><strong>{synced}</strong><span>已进入 AnythingLLM</span></article><article><small>failed</small><strong>{failed}</strong><span>需要重试</span></article><article><small>最近扫描</small><strong className="dateValue">{lastRun}</strong><span>服务器状态库</span></article></div>
        <div className="pipeline"><b>文章来源</b><i>→</i><b>incoming</b><i>→</i><b>SQLite 去重</b><i>→</i><b>processed</b><i>→</i><b>AnythingLLM</b></div>
      </> : <div className="dashboardNotice"><strong>服务器状态尚未连接到当前 Demo。</strong><p>部署到 ECS 后配置 <code>XJTLU_CONTENT_ROOT=/mnt/sdd/xjtlu-content</code>，即可在这里读取真实 articles.db 统计。</p></div>}
    </section>

    <section className="dashboardPanel">
      <div className="panelHeader"><div><span>USER EXPERIENCE</span><h2>当前 Demo 使用侧数据</h2></div><Link href="/history">查看对话历史 →</Link></div>
      <div className="roadmapGrid"><div><strong>{conversationCount ?? "…"}</strong><p>AnythingLLM 历史问答</p></div><div><strong>{customSkillCount}</strong><p>创建 / 导入的自定义技能</p></div><div><strong>{feedbackCount + surveyCount}</strong><p>快速反馈 + Section E</p></div></div>
    </section>

    <section className="dashboardPanel">
      <div><span>ROADMAP</span><h2>下一批接入指标</h2></div>
      <div className="roadmapGrid"><div><strong>真实 Token usage</strong><p>等待模型 API usage 数据接入，不做估算。</p></div><div><strong>公众号分布</strong><p>服务器 articles.db 按 account 聚合。</p></div><div><strong>反馈统计</strong><p>正式多人研究时迁移到 Supabase 后生成汇总。</p></div></div>
    </section>

    <style jsx global>{`
      .managementPage{min-height:100vh;background:#f6f7fa;padding:0 28px 70px;color:#19232d}.managementTop{height:70px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e3e7ed}.managementTop a{color:#5965d8;text-decoration:none;font-weight:700}.managementTop span,.managementHero>span,.dashboardPanel>div>span,.panelHeader>div>span{font-size:11px;letter-spacing:.13em;color:#6570dc;font-weight:800}.managementHero{max-width:1050px;margin:54px auto 28px}.managementHero h1{font-size:34px;margin:9px 0}.managementHero p{color:#6f7a85}.metricGrid,.dashboardPanel{max-width:1050px;margin:0 auto 18px}.metricGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metricGrid article,.dashboardPanel{background:#fff;border:1px solid #e2e6ec;border-radius:16px;padding:20px}.metricGrid small,.metricGrid span{display:block;color:#7b8691}.metricGrid strong{display:block;font-size:25px;margin:9px 0;line-height:1.15}.metricGrid span{font-size:11px;line-height:1.5}.dashboardPanel{padding:24px}.dashboardPanel h2{margin:5px 0 18px}.panelHeader{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.panelHeader a,.dashboardPanel>a{color:#5965d8;text-decoration:none;font-weight:700}.pipeline{display:flex;align-items:center;gap:10px;flex-wrap:wrap;margin-top:16px}.pipeline b{background:#f1f2ff;color:#4f5cc9;padding:9px 12px;border-radius:10px}.pipeline i{font-style:normal;color:#a0a8b2}.dashboardPanel p{color:#707b85;line-height:1.7}.roadmapGrid,.syncMetrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.roadmapGrid{grid-template-columns:repeat(3,1fr)}.roadmapGrid>div,.syncMetrics article{background:#f8f9fb;border-radius:12px;padding:16px}.roadmapGrid strong{font-size:24px}.roadmapGrid p{margin-bottom:0;font-size:13px}.syncMetrics small,.syncMetrics span{display:block;color:#7a8790}.syncMetrics strong{display:block;font-size:24px;margin:6px 0}.syncMetrics .dateValue{font-size:13px;line-height:1.5}.dashboardNotice{background:#f7f8fb;border-left:4px solid #6570dc;border-radius:10px;padding:14px 16px}.dashboardNotice p{margin-bottom:0}.dashboardNotice code{background:#eceef3;padding:2px 5px;border-radius:5px}@media(max-width:900px){.metricGrid,.syncMetrics{grid-template-columns:1fr 1fr}.roadmapGrid{grid-template-columns:1fr 1fr}}@media(max-width:520px){.metricGrid,.syncMetrics,.roadmapGrid{grid-template-columns:1fr}.managementPage{padding-inline:14px}.panelHeader{flex-direction:column}}
    `}</style>
  </main>;
}
