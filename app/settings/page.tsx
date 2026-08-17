"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

const SKILL_COLLAPSE_KEY = "xjtlu-skill-rail-collapsed";
const SETTINGS_KEY = "xjtlu-ui-settings-v1";

type UiSettings = { compactMode: boolean; rememberLastSkill: boolean; showEvidenceFirst: boolean };
const defaults: UiSettings = { compactMode: false, rememberLastSkill: true, showEvidenceFirst: true };

export default function SettingsPage() {
  const [skillCollapsed, setSkillCollapsed] = useState(false);
  const [settings, setSettings] = useState<UiSettings>(defaults);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      setSkillCollapsed(localStorage.getItem(SKILL_COLLAPSE_KEY) === "1");
      const parsed = JSON.parse(localStorage.getItem(SETTINGS_KEY) || "null");
      if (parsed) setSettings({ ...defaults, ...parsed });
    } catch {}
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
    <section className="settingsHero"><span>设置</span><h1>界面与交互偏好</h1><p>当前设置先保存在本机浏览器，不会写入 AnythingLLM。服务器级设置后续单独放到管理员页面。</p></section>
    <section className="settingsCard">
      <div className="settingRow"><div><strong>默认收起技能中心</strong><p>适合小屏幕或希望聊天区域更宽的场景。</p></div><input type="checkbox" checked={skillCollapsed} onChange={(e) => persistSkillCollapsed(e.target.checked)} /></div>
      <div className="settingRow"><div><strong>紧凑界面</strong><p>为后续压缩卡片间距和导航密度预留。</p></div><input type="checkbox" checked={settings.compactMode} onChange={(e) => update("compactMode", e.target.checked)} /></div>
      <div className="settingRow"><div><strong>记住上次技能</strong><p>后续可用于恢复最近使用的技能。</p></div><input type="checkbox" checked={settings.rememberLastSkill} onChange={(e) => update("rememberLastSkill", e.target.checked)} /></div>
      <div className="settingRow"><div><strong>优先展示证据</strong><p>回答卡片优先展示来源与发布时间，适合可核查场景。</p></div><input type="checkbox" checked={settings.showEvidenceFirst} onChange={(e) => update("showEvidenceFirst", e.target.checked)} /></div>
    </section>
    <section className="settingsCard admin"><span>ADMIN SETTINGS</span><h2>服务器设置后续放这里</h2><p>包括 AnythingLLM 连通性、Workspace 映射、文章同步状态、定时任务和 API Key 健康检查。敏感密钥不会展示在浏览器端。</p><Link href="/knowledge-base">进入知识库管理 →</Link></section>
    <style jsx>{`
      .settingsPage{min-height:100vh;background:#f6f7fa;padding:0 28px 70px;color:#19232d}.settingsPage header{height:70px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e3e7ed}.settingsPage header a,.settingsCard a{color:#5965d8;text-decoration:none;font-weight:700}.settingsPage header span,.settingsHero>span,.settingsCard.admin>span{font-size:11px;letter-spacing:.13em;color:#6570dc;font-weight:800}.settingsHero,.settingsCard{max-width:820px;margin-left:auto;margin-right:auto}.settingsHero{margin-top:54px}.settingsHero h1{font-size:34px;margin:9px 0}.settingsHero p,.settingRow p,.settingsCard.admin p{color:#6f7a85;line-height:1.7}.settingsCard{margin-top:22px;background:#fff;border:1px solid #e1e6ec;border-radius:16px;padding:8px 24px}.settingRow{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:18px 0;border-bottom:1px solid #edf0f4}.settingRow:last-child{border-bottom:0}.settingRow strong{display:block}.settingRow p{margin:4px 0 0;font-size:13px}.settingRow input{width:42px;height:22px;accent-color:#5b61e9}.settingsCard.admin{padding:24px}.settingsCard.admin h2{margin:6px 0}.settingsCard.admin p{margin-bottom:14px}
    `}</style>
  </main>;
}
