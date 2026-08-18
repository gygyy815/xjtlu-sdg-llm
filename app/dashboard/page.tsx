"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { getStoredClientIds } from "@/lib/client-id";

type SyncStatus = { connected?: boolean; total?: number; status?: Record<string, number>; last_run?: { finished_at?: string; started_at?: string; failed?: number } | null };

export default function DashboardPage() {
  const [workspaceCount, setWorkspaceCount] = useState<number | null>(null);
  const [conversationCount, setConversationCount] = useState<number | null>(null);
  const [sessionCount, setSessionCount] = useState<number | null>(null);
  const [customSkillCount, setCustomSkillCount] = useState(0);
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [surveyCount, setSurveyCount] = useState(0);
  const [averageOverall, setAverageOverall] = useState<number | null>(null);
  const [feedbackStorage, setFeedbackStorage] = useState<"supabase" | "local">("local");
  const [sync, setSync] = useState<SyncStatus>({});

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((data) => setWorkspaceCount(Array.isArray(data.accounts) ? data.accounts.length : 0)).catch(() => setWorkspaceCount(0));

    const ids = getStoredClientIds();
    setSessionCount(ids.length);
    const historyParams = new URLSearchParams({ limit: "250", sessionIds: ids.join(",") });
    fetch(`/api/history?${historyParams.toString()}`).then((r) => r.json()).then((data) => setConversationCount(Number(data.conversationCount || 0))).catch(() => setConversationCount(0));

    fetch("/api/server-sync/status").then((r) => r.json()).then((data) => setSync(data || {})).catch(() => setSync({ connected: false }));

    try {
      const parsed = JSON.parse(localStorage.getItem("xjtlu-custom-skills-v1") || "[]");
      setCustomSkillCount(Array.isArray(parsed) ? parsed.length : 0);
      const feedback = JSON.parse(localStorage.getItem("xjtlu-feedback-v2") || "[]");
      const survey = JSON.parse(localStorage.getItem("xjtlu-prototype-survey-e-v1") || "[]");
      setFeedbackCount(Array.isArray(feedback) ? feedback.length : 0);
      setSurveyCount(Array.isArray(survey) ? survey.length : 0);
      const overall = Array.isArray(survey) ? survey.map((item: any) => Number(item?.ratings?.overall)).filter((value: number) => Number.isFinite(value) && value >= 1 && value <= 5) : [];
      if (overall.length) setAverageOverall(Number((overall.reduce((a: number, b: number) => a + b, 0) / overall.length).toFixed(2)));
    } catch {}

    fetch("/api/feedback", { cache: "no-store" }).then((r) => r.json()).then((data) => {
      if (data?.configured && data?.storage === "supabase" && !data?.error) {
        setFeedbackStorage("supabase");
        setFeedbackCount(Number(data.quickCount || 0));
        setSurveyCount(Number(data.surveyCount || 0));
        setAverageOverall(Number.isFinite(Number(data.averageOverall)) ? Number(data.averageOverall) : null);
      }
    }).catch(() => {});
  }, []);

  const processed = sync.status?.processed || 0;
  const synced = sync.status?.synced || 0;
  const failed = sync.status?.failed || 0;
  const lastRun = sync.last_run?.finished_at || sync.last_run?.started_at || "暂无";

  return <main className="managementPage">
    <header className="managementTop"><Link href="/">← 返回助手</Link><span>DATA DASHBOARD · BETA</span></header>
    <section className="managementHero"><span>数据看板</span><h1>系统运行状态与用户体验概览</h1><p>对话指标现在只统计当前浏览器用户的 API sessions，不再展示其他测试用户的 AnythingLLM 历史。</p></section>

    <section className="metricGrid">
      <article><small>正式 Workspace</small><strong>{workspaceCount ?? "…"}</strong><span>当前 AnythingLLM</span></article>
      <article><small>我的历史会话</small><strong>{conversationCount ?? "…"}</strong><span>{sessionCount ?? "…"} 个本机 Session</span></article>
      <article><small>反馈 / 原型问卷</small><strong>{feedbackCount + surveyCount}</strong><span>{feedbackStorage === "supabase" ? "Supabase" : "本机备用存储"}</span></article>
      <article><small>整体满意度</small><strong>{averageOverall === null ? "—" : `${averageOverall}/5`}</strong><span>Section E · Overall experience</span></article>
      <article><small>自定义技能</small><strong>{customSkillCount}</strong><span>创建 / 导入</span></article>
      <article><small>服务器文章</small><strong>{sync.connected ? (sync.total ?? 0) : "—"}</strong><span>{sync.connected ? "articles.db" : "同步阶段暂缓"}</span></article>
      <article><small>同步失败</small><strong>{sync.connected ? failed : "—"}</strong><span>failed</span></article>
      <article><small>Token 统计</small><strong>待接入</strong><span>不使用估算数据</span></article>
    </section>

    <section className="dashboardPanel">
      <div className="panelHeader"><div><span>USER EXPERIENCE</span><h2>Demo 使用与研究反馈</h2></div><Link href="/feedback">反馈与建议 →</Link></div>
      <div className="roadmapGrid"><div><strong>{conversationCount ?? "…"}</strong><p>当前浏览器用户历史会话。</p></div><div><strong>{feedbackCount}</strong><p>快速反馈</p></div><div><strong>{surveyCount}</strong><p>Section E 原型体验问卷</p></div><div><strong>{averageOverall === null ? "—" : averageOverall}</strong><p>整体体验平均评分 / 5</p></div></div>
      <div className={`dataSourceNotice ${feedbackStorage}`}><strong>反馈数据源：{feedbackStorage === "supabase" ? "Supabase" : "浏览器 localStorage"}</strong><span>{feedbackStorage === "supabase" ? "已进入集中研究数据存储。" : "仅适合本机测试；正式多人测试前请配置 Supabase。"}</span></div>
    </section>

    <section className="dashboardPanel">
      <div className="panelHeader"><div><span>CONVERSATION</span><h2>当前用户对话状态</h2></div><Link href="/history">查看我的对话历史 →</Link></div>
      <div className="syncMetrics"><article><small>我的历史会话</small><strong>{conversationCount ?? "…"}</strong><span>浏览器隔离</span></article><article><small>本机 Session</small><strong>{sessionCount ?? "…"}</strong><span>最多保留最近 20 个</span></article><article><small>Workspace</small><strong>{workspaceCount ?? "…"}</strong><span>正式配置</span></article><article><small>自定义技能</small><strong>{customSkillCount}</strong><span>浏览器保存</span></article></div>
    </section>

    <section className="dashboardPanel">
      <div className="panelHeader"><div><span>SYNC PIPELINE</span><h2>文章同步状态（暂缓）</h2></div><Link href="/knowledge-base">知识库管理 →</Link></div>
      {sync.connected ? <><div className="syncMetrics"><article><small>processed</small><strong>{processed}</strong><span>等待 AnythingLLM</span></article><article><small>synced</small><strong>{synced}</strong><span>已进入 AnythingLLM</span></article><article><small>failed</small><strong>{failed}</strong><span>需要重试</span></article><article><small>最近扫描</small><strong className="dateValue">{lastRun}</strong><span>服务器状态库</span></article></div></> : <div className="dashboardNotice"><strong>当前阶段已暂停文章同步开发。</strong><p>这不会影响 Chat、Skill、知识图谱、对话历史与反馈测试。</p></div>}
    </section>

    <style jsx global>{`
      .managementPage{min-height:100vh;background:#f6f7fa;padding:0 28px 70px;color:#19232d}.managementTop{height:70px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e3e7ed}.managementTop a{color:#5965d8;text-decoration:none;font-weight:700}.managementTop span,.managementHero>span,.dashboardPanel>div>span,.panelHeader>div>span{font-size:11px;letter-spacing:.13em;color:#6570dc;font-weight:800}.managementHero{max-width:1050px;margin:54px auto 28px}.managementHero h1{font-size:34px;margin:9px 0}.managementHero p{color:#6f7a85}.metricGrid,.dashboardPanel{max-width:1050px;margin:0 auto 18px}.metricGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metricGrid article,.dashboardPanel{background:#fff;border:1px solid #e2e6ec;border-radius:16px;padding:20px}.metricGrid small,.metricGrid span{display:block;color:#7b8691}.metricGrid strong{display:block;font-size:25px;margin:9px 0;line-height:1.15}.metricGrid span{font-size:11px;line-height:1.5}.dashboardPanel{padding:24px}.dashboardPanel h2{margin:5px 0 18px}.panelHeader{display:flex;justify-content:space-between;align-items:flex-start;gap:12px}.panelHeader a{color:#5965d8;text-decoration:none;font-weight:700}.dashboardPanel p{color:#707b85;line-height:1.7}.roadmapGrid,.syncMetrics{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.roadmapGrid>div,.syncMetrics article{background:#f8f9fb;border-radius:12px;padding:16px}.roadmapGrid strong{font-size:24px}.roadmapGrid p{margin-bottom:0;font-size:13px}.syncMetrics small,.syncMetrics span{display:block;color:#7a8790}.syncMetrics strong{display:block;font-size:24px;margin:6px 0}.syncMetrics .dateValue{font-size:13px;line-height:1.5}.dashboardNotice{background:#f7f8fb;border-left:4px solid #6570dc;border-radius:10px;padding:14px 16px}.dashboardNotice p{margin-bottom:0}.dataSourceNotice{margin-top:14px;padding:12px 14px;border-radius:10px;background:#fff5e8;color:#755b2b}.dataSourceNotice.supabase{background:#eaf7f1;color:#246c53}.dataSourceNotice strong,.dataSourceNotice span{display:block}.dataSourceNotice span{font-size:11px;margin-top:3px}@media(max-width:900px){.metricGrid,.syncMetrics,.roadmapGrid{grid-template-columns:1fr 1fr}}@media(max-width:520px){.metricGrid,.syncMetrics,.roadmapGrid{grid-template-columns:1fr}.managementPage{padding-inline:14px}.panelHeader{flex-direction:column}}
    `}</style>
  </main>;
}
