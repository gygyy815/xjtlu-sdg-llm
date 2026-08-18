"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type HistoryItem = { role?: string; workspace?: string; sentAt?: number | null };

export default function DashboardPage() {
  const [workspaceCount, setWorkspaceCount] = useState<number | null>(null);
  const [customSkillCount, setCustomSkillCount] = useState(0);
  const [history, setHistory] = useState<HistoryItem[]>([]);
  const [historyStatus, setHistoryStatus] = useState("正在读取 AnythingLLM…");
  const [feedbackCount, setFeedbackCount] = useState(0);
  const [surveyCount, setSurveyCount] = useState(0);

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((data) => setWorkspaceCount(Array.isArray(data.accounts) ? data.accounts.length : 0)).catch(() => setWorkspaceCount(0));
    fetch("/api/history?limit=80").then((r) => r.json()).then((data) => {
      const items = Array.isArray(data.items) ? data.items : [];
      setHistory(items);
      setHistoryStatus(items.length ? "来自 AnythingLLM 当前正式 Workspace" : "暂未读取到历史消息");
    }).catch(() => setHistoryStatus("对话历史暂不可用"));
    try {
      const parsed = JSON.parse(localStorage.getItem("xjtlu-custom-skills-v1") || "[]");
      setCustomSkillCount(Array.isArray(parsed) ? parsed.length : 0);
      const feedback = JSON.parse(localStorage.getItem("xjtlu-feedback-v2") || "[]");
      const survey = JSON.parse(localStorage.getItem("xjtlu-prototype-survey-e-v1") || "[]");
      setFeedbackCount(Array.isArray(feedback) ? feedback.length : 0);
      setSurveyCount(Array.isArray(survey) ? survey.length : 0);
    } catch {}
  }, []);

  const userMessages = useMemo(() => history.filter((item) => item.role === "user").length, [history]);
  const historyWorkspaceCount = useMemo(() => new Set(history.map((item) => item.workspace).filter(Boolean)).size, [history]);

  return <main className="managementPage">
    <header className="managementTop"><Link href="/">← 返回助手</Link><span>DATA DASHBOARD · BETA</span></header>
    <section className="managementHero"><span>数据看板</span><h1>系统运行状态与知识库概览</h1><p>这一版开始优先展示真实可读取的数据：正式 Workspace、AnythingLLM 历史消息、浏览器中的自定义技能与原型反馈。Token 与服务器文章同步指标仍等待服务端状态库接入。</p></section>

    <section className="metricGrid">
      <article><small>正式 Workspace</small><strong>{workspaceCount ?? "…"}</strong><span>来自当前 .env.local + AnythingLLM 校验</span></article>
      <article><small>历史用户提问</small><strong>{userMessages}</strong><span>{historyStatus}</span></article>
      <article><small>自定义技能</small><strong>{customSkillCount}</strong><span>当前浏览器保存</span></article>
      <article><small>反馈 / 原型问卷</small><strong>{feedbackCount + surveyCount}</strong><span>{feedbackCount} 条快速反馈 · {surveyCount} 份问卷</span></article>
      <article><small>历史涉及 Workspace</small><strong>{historyWorkspaceCount}</strong><span>根据 AnythingLLM 历史统计</span></article>
      <article><small>文章同步</small><strong>Phase 1</strong><span>服务器仓库 + SQLite</span></article>
      <article><small>Token 统计</small><strong>待接入</strong><span>不使用估算数据</span></article>
      <article><small>反馈正式存储</small><strong>待接 Supabase</strong><span>当前 Beta 版先保存在浏览器</span></article>
    </section>

    <section className="dashboardPanel"><div><span>CONVERSATION</span><h2>对话历史已经接入 AnythingLLM</h2></div><p>左侧“对话历史”现在会读取当前正式 Workspace 中 AnythingLLM 已保存的历史消息，而不是显示空白占位页。当前共读取 {history.length} 条历史消息。</p><Link href="/history">查看对话历史 →</Link></section>

    <section className="dashboardPanel"><div><span>SYNC PIPELINE</span><h2>文章同步链路</h2></div><div className="pipeline"><b>公众号来源</b><i>→</i><b>服务器 incoming</b><i>→</i><b>SQLite 去重</b><i>→</i><b>processed</b><i>→</i><b>AnythingLLM</b></div><p>下一阶段把服务器端 articles.db 接入这里后，可显示文章总量、今日新增、待同步、失败与最近同步时间。</p><Link href="/knowledge-base">查看知识库管理 →</Link></section>

    <section className="dashboardPanel"><div><span>FEEDBACK</span><h2>原型反馈收集</h2></div><div className="roadmapGrid"><div><strong>快速反馈</strong><p>{feedbackCount} 条，本机浏览器保存</p></div><div><strong>Section E 原型问卷</strong><p>{surveyCount} 份，本机浏览器保存</p></div><div><strong>下一步</strong><p>接入 Supabase 后集中收集研究参与者反馈</p></div></div><Link href="/feedback">进入反馈与建议 →</Link></section>

    <style jsx global>{`
      .managementPage{min-height:100vh;background:#f6f7fa;padding:0 28px 70px;color:#19232d}.managementTop{height:70px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e3e7ed}.managementTop a{color:#5965d8;text-decoration:none;font-weight:700}.managementTop span,.managementHero>span,.dashboardPanel>div>span{font-size:11px;letter-spacing:.13em;color:#6570dc;font-weight:800}.managementHero{max-width:1050px;margin:54px auto 28px}.managementHero h1{font-size:34px;margin:9px 0}.managementHero p{color:#6f7a85;line-height:1.7}.metricGrid,.dashboardPanel{max-width:1050px;margin:0 auto 18px}.metricGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metricGrid article,.dashboardPanel{background:#fff;border:1px solid #e2e6ec;border-radius:16px;padding:20px}.metricGrid small,.metricGrid span{display:block;color:#7b8691}.metricGrid strong{display:block;font-size:25px;margin:9px 0;line-height:1.15}.metricGrid span{font-size:11px;line-height:1.5}.dashboardPanel{padding:24px}.dashboardPanel h2{margin:5px 0 18px}.pipeline{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.pipeline b{background:#f1f2ff;color:#4f5cc9;padding:9px 12px;border-radius:10px}.pipeline i{font-style:normal;color:#a0a8b2}.dashboardPanel p{color:#707b85;line-height:1.7}.dashboardPanel a{color:#5965d8;text-decoration:none;font-weight:700}.roadmapGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px;margin-bottom:16px}.roadmapGrid>div{background:#f8f9fb;border-radius:12px;padding:16px}.roadmapGrid p{margin-bottom:0;font-size:13px}@media(max-width:900px){.metricGrid{grid-template-columns:1fr 1fr}.roadmapGrid{grid-template-columns:1fr}}@media(max-width:520px){.metricGrid{grid-template-columns:1fr}}
    `}</style>
  </main>;
}
