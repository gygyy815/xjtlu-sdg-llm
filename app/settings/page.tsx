"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const SKILL_COLLAPSE_KEY = "xjtlu-skill-rail-collapsed";
const SETTINGS_KEY = "xjtlu-ui-settings-v1";

type UiSettings = { compactMode: boolean; rememberLastSkill: boolean; showEvidenceFirst: boolean };
type SystemStatus = {
  anythingllm?: { configured?: boolean; connected?: boolean; workspaceCount?: number; message?: string };
  supabaseFeedback?: { configured?: boolean; table?: string; message?: string };
  userHistory?: { mode?: string; configured?: boolean; message?: string };
  serverRepository?: { configured?: boolean; message?: string };
  optionalTools?: { mindMap?: string; pptx?: string; extraPackagesRequired?: boolean; message?: string };
};
const defaults: UiSettings = { compactMode: false, rememberLastSkill: true, showEvidenceFirst: true };

export default function SettingsPage() {
  const [skillCollapsed, setSkillCollapsed] = useState(false);
  const [settings, setSettings] = useState<UiSettings>(defaults);
  const [saved, setSaved] = useState(false);
  const [system, setSystem] = useState<SystemStatus | null>(null);

  useEffect(() => {
    try {
      setSkillCollapsed(localStorage.getItem(SKILL_COLLAPSE_KEY) === "1");
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (parsed) setSettings({ ...defaults, ...parsed });
    } catch {}
    fetch("/api/system-status").then((response) => response.json()).then(setSystem).catch(() => setSystem({}));
  }, []);

  function persistSkillCollapsed(value: boolean) {
    setSkillCollapsed(value);
    localStorage.setItem(SKILL_COLLAPSE_KEY, value ? "1" : "0");
    setSaved(true); window.setTimeout(() => setSaved(false), 1200);
  }

  function update<K extends keyof UiSettings>(key: K, value: UiSettings[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next); localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    setSaved(true); window.setTimeout(() => setSaved(false), 1200);
  }

  return <main className="settingsPage">
    <header><Link href="/">← 返回助手</Link><span>{saved ? "已保存" : "SETTINGS · LOCAL"}</span></header>
    <section className="settingsHero"><span>设置</span><h1>界面、隐私与系统配置</h1><p>浏览器偏好保存在本机；AnythingLLM、Supabase 等服务器配置只检查“是否已配置”，不会把密钥展示给前端。</p></section>

    <section className="settingsCard">
      <div className="settingRow"><div><strong>默认收起技能中心</strong><p>适合小屏幕或希望聊天区域更宽的场景。</p></div><input type="checkbox" checked={skillCollapsed} onChange={(e) => persistSkillCollapsed(e.target.checked)} /></div>
      <div className="settingRow"><div><strong>紧凑界面</strong><p>为后续压缩卡片间距和导航密度预留。</p></div><input type="checkbox" checked={settings.compactMode} onChange={(e) => update("compactMode", e.target.checked)} /></div>
      <div className="settingRow"><div><strong>记住上次技能</strong><p>后续可用于恢复最近使用的技能。</p></div><input type="checkbox" checked={settings.rememberLastSkill} onChange={(e) => update("rememberLastSkill", e.target.checked)} /></div>
      <div className="settingRow"><div><strong>优先展示证据</strong><p>回答卡片优先展示来源与发布时间，适合可核查场景。</p></div><input type="checkbox" checked={settings.showEvidenceFirst} onChange={(e) => update("showEvidenceFirst", e.target.checked)} /></div>
    </section>

    <section className="settingsCard statusCard">
      <span>SYSTEM CHECK</span><h2>哪些项目还需要手动配置？</h2>
      {!system && <p>正在检查当前配置…</p>}
      {system && <div className="statusGrid">
        <article className={system.anythingllm?.connected ? "ok" : "warn"}><b>{system.anythingllm?.connected ? "✓" : "!"}</b><div><strong>AnythingLLM</strong><p>{system.anythingllm?.message || "状态未知"}</p>{system.anythingllm?.connected && <small>{system.anythingllm.workspaceCount || 0} 个 Workspace</small>}</div></article>
        <article className={system.supabaseFeedback?.configured ? "ok" : "optional"}><b>{system.supabaseFeedback?.configured ? "✓" : "○"}</b><div><strong>Supabase Feedback</strong><p>{system.supabaseFeedback?.message}</p><small>{system.supabaseFeedback?.configured ? `表：${system.supabaseFeedback.table}` : "正式多人问卷采集前建议配置"}</small></div></article>
        <article className="ok"><b>✓</b><div><strong>私有对话历史</strong><p>{system.userHistory?.message}</p><small>当前模式：{system.userHistory?.mode || "browser-session"}</small></div></article>
        <article className={system.serverRepository?.configured ? "ok" : "optional"}><b>{system.serverRepository?.configured ? "✓" : "○"}</b><div><strong>服务器文章仓库</strong><p>{system.serverRepository?.message}</p><small>同步暂停时无需配置</small></div></article>
        <article className="ok"><b>✓</b><div><strong>思维导图 / PPT</strong><p>{system.optionalTools?.message}</p><small>不需要新的 API Key</small></div></article>
      </div>}
    </section>

    <section className="settingsCard admin"><span>MANUAL SETUP</span><h2>当前真正需要手动做的只有两类</h2><div className="manualList"><div><strong>① 正式反馈采集（可选）</strong><p>在 Supabase SQL Editor 执行 <code>supabase/feedback_schema.sql</code>，再在服务器 .env.local 配置 SUPABASE_URL、SUPABASE_SERVICE_ROLE_KEY 和 SUPABASE_FEEDBACK_TABLE。</p></div><div><strong>② 正式账号级个人历史（后续）</strong><p>当前已经按浏览器 session 隔离。若需要“同一学生跨电脑/手机登录后看到自己的历史”，再接 Supabase Auth 或学校统一身份认证。</p></div></div><Link href="/knowledge-base">进入知识库管理 →</Link></section>

    <style jsx>{`
      .settingsPage{min-height:100vh;background:#f6f7fa;padding:0 28px 70px;color:#19232d}.settingsPage header{height:70px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e3e7ed}.settingsPage header a,.settingsCard a{color:#5965d8;text-decoration:none;font-weight:700}.settingsPage header span,.settingsHero>span,.settingsCard.admin>span,.statusCard>span{font-size:11px;letter-spacing:.13em;color:#6570dc;font-weight:800}.settingsHero,.settingsCard{max-width:900px;margin-left:auto;margin-right:auto}.settingsHero{margin-top:54px}.settingsHero h1{font-size:34px;margin:9px 0}.settingsHero p,.settingRow p,.settingsCard.admin p,.statusGrid p{color:#6f7a85;line-height:1.7}.settingsCard{margin-top:22px;background:#fff;border:1px solid #e1e6ec;border-radius:16px;padding:8px 24px}.settingRow{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px 0;border-bottom:1px solid #edf0f4}.settingRow:last-child{border-bottom:0}.settingRow strong{display:block}.settingRow p{margin:4px 0 0;font-size:13px}.settingRow input{width:42px;height:22px;accent-color:#5b61e9}.settingsCard.admin,.statusCard{padding:24px}.settingsCard.admin h2,.statusCard h2{margin:6px 0 16px}.settingsCard.admin p{margin-bottom:14px}.statusGrid{display:grid;grid-template-columns:1fr 1fr;gap:10px}.statusGrid article{display:grid;grid-template-columns:36px minmax(0,1fr);gap:10px;padding:14px;border-radius:12px;background:#f8f9fb;border:1px solid #e8ebef}.statusGrid article>b{width:30px;height:30px;border-radius:50%;display:grid;place-items:center;background:#e9ecf2;color:#68737d}.statusGrid article.ok>b{background:#e5f5ee;color:#27805f}.statusGrid article.warn>b{background:#fff0e7;color:#be6a2a}.statusGrid article.optional>b{background:#f1f2ff;color:#6973d9}.statusGrid article strong{font-size:13px}.statusGrid p{font-size:12px;margin:3px 0}.statusGrid small{font-size:10px;color:#8b949d}.manualList{display:grid;gap:10px;margin-bottom:14px}.manualList>div{background:#f8f9fb;border-radius:11px;padding:14px}.manualList p{margin:5px 0 0!important;font-size:13px}.manualList code{background:#eceef3;padding:2px 5px;border-radius:5px}@media(max-width:700px){.statusGrid{grid-template-columns:1fr}.settingsPage{padding-inline:14px}}
    `}</style>
  </main>;
}
