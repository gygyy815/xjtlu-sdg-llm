"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

export default function DashboardPage() {
  const [workspaceCount, setWorkspaceCount] = useState<number | null>(null);
  const [customSkillCount, setCustomSkillCount] = useState(0);

  useEffect(() => {
    fetch("/api/config").then((r) => r.json()).then((data) => setWorkspaceCount(Array.isArray(data.accounts) ? data.accounts.length : 0)).catch(() => setWorkspaceCount(0));
    try {
      const parsed = JSON.parse(localStorage.getItem("xjtlu-custom-skills-v1") || "[]");
      setCustomSkillCount(Array.isArray(parsed) ? parsed.length : 0);
    } catch {}
  }, []);

  return <main className="managementPage">
    <header className="managementTop"><Link href="/">← 返回助手</Link><span>DATA DASHBOARD · BETA</span></header>
    <section className="managementHero"><span>数据看板</span><h1>系统运行状态与知识库概览</h1><p>先展示当前可以可靠取得的数据；Token、文章同步和全局使用量会在服务器状态库接入后自动补全。</p></section>
    <section className="metricGrid">
      <article><small>知识库 / Workspace</small><strong>{workspaceCount ?? "…"}</strong><span>当前前端已配置</span></article>
      <article><small>自定义技能</small><strong>{customSkillCount}</strong><span>当前浏览器保存</span></article>
      <article><small>文章同步</small><strong>Phase 1</strong><span>服务器仓库 + SQLite</span></article>
      <article><small>Token 统计</small><strong>待接入</strong><span>不使用估算数据</span></article>
    </section>
    <section className="dashboardPanel"><div><span>SYNC PIPELINE</span><h2>文章同步链路</h2></div><div className="pipeline"><b>公众号来源</b><i>→</i><b>服务器 incoming</b><i>→</i><b>SQLite 去重</b><i>→</i><b>processed</b><i>→</i><b>AnythingLLM</b></div><p>下一阶段把服务器端 articles.db 接入这里后，可显示文章总量、今日新增、待同步、失败与最近同步时间。</p><Link href="/knowledge-base">查看知识库管理 →</Link></section>
    <section className="dashboardPanel"><div><span>ROADMAP</span><h2>即将接入的指标</h2></div><div className="roadmapGrid"><div><strong>服务器文章</strong><p>总数、新增、更新、失败</p></div><div><strong>AnythingLLM</strong><p>已同步、待同步、Workspace 分布</p></div><div><strong>AI 使用</strong><p>对话请求、技能使用、真实 Token usage</p></div></div></section>
    <style jsx global>{`
      .managementPage{min-height:100vh;background:#f6f7fa;padding:0 28px 70px;color:#19232d}.managementTop{height:70px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e3e7ed}.managementTop a{color:#5965d8;text-decoration:none;font-weight:700}.managementTop span,.managementHero>span,.dashboardPanel>div>span{font-size:11px;letter-spacing:.13em;color:#6570dc;font-weight:800}.managementHero{max-width:1050px;margin:54px auto 28px}.managementHero h1{font-size:34px;margin:9px 0}.managementHero p{color:#6f7a85}.metricGrid,.dashboardPanel{max-width:1050px;margin:0 auto 18px}.metricGrid{display:grid;grid-template-columns:repeat(4,1fr);gap:12px}.metricGrid article,.dashboardPanel{background:#fff;border:1px solid #e2e6ec;border-radius:16px;padding:20px}.metricGrid small,.metricGrid span{display:block;color:#7b8691}.metricGrid strong{display:block;font-size:27px;margin:9px 0}.metricGrid span{font-size:12px}.dashboardPanel{padding:24px}.dashboardPanel h2{margin:5px 0 18px}.pipeline{display:flex;align-items:center;gap:10px;flex-wrap:wrap}.pipeline b{background:#f1f2ff;color:#4f5cc9;padding:9px 12px;border-radius:10px}.pipeline i{font-style:normal;color:#a0a8b2}.dashboardPanel p{color:#707b85;line-height:1.7}.dashboardPanel a{color:#5965d8;text-decoration:none;font-weight:700}.roadmapGrid{display:grid;grid-template-columns:repeat(3,1fr);gap:12px}.roadmapGrid>div{background:#f8f9fb;border-radius:12px;padding:16px}.roadmapGrid p{margin-bottom:0;font-size:13px}@media(max-width:800px){.metricGrid,.roadmapGrid{grid-template-columns:1fr 1fr}}@media(max-width:520px){.metricGrid,.roadmapGrid{grid-template-columns:1fr}}
    `}</style>
  </main>;
}
