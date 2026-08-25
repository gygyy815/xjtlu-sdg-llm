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

  function flashSaved() {
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1200);
  }

  function persistSkillCollapsed(value: boolean) {
    setSkillCollapsed(value);
    localStorage.setItem(SKILL_COLLAPSE_KEY, value ? "1" : "0");
    flashSaved();
  }

  function update<K extends keyof UiSettings>(key: K, value: UiSettings[K]) {
    const next = { ...settings, [key]: value };
    setSettings(next);
    localStorage.setItem(SETTINGS_KEY, JSON.stringify(next));
    flashSaved();
  }

  return <main className="settingsPage userSettingsPage">
    <header><Link href="/">← 返回助手</Link><span>{saved ? "已保存" : "个人设置"}</span></header>

    <section className="settingsHero">
      <span>我的偏好</span>
      <h1>把校园助手调整成你更顺手的样子</h1>
      <p>这些设置只影响当前浏览器中的显示和使用习惯，不会公开你的个人信息。</p>
    </section>

    <section className="settingsCard">
      <div className="settingRow"><div><strong>默认收起技能</strong><p>保持聊天界面更简洁，需要时再从输入框打开技能。</p></div><input type="checkbox" checked={skillCollapsed} onChange={(e) => persistSkillCollapsed(e.target.checked)} /></div>
      <div className="settingRow"><div><strong>紧凑显示</strong><p>减少部分卡片与内容间距，适合较小的屏幕。</p></div><input type="checkbox" checked={settings.compactMode} onChange={(e) => update("compactMode", e.target.checked)} /></div>
      <div className="settingRow"><div><strong>记住上次使用的技能</strong><p>下次继续使用时，保留你最近选择的工具偏好。</p></div><input type="checkbox" checked={settings.rememberLastSkill} onChange={(e) => update("rememberLastSkill", e.target.checked)} /></div>
      <div className="settingRow"><div><strong>优先展示来源证据</strong><p>回答中优先显示来源、日期和可核查信息。</p></div><input type="checkbox" checked={settings.showEvidenceFirst} onChange={(e) => update("showEvidenceFirst", e.target.checked)} /></div>
    </section>

    <section className="settingsCard privacyCard">
      <span>隐私说明</span>
      <h2>你的当前 Demo 记录只保存在本浏览器范围内</h2>
      <p>对话历史与部分工具记录按当前浏览器会话隔离。不要在 Demo 中输入密码、证件号码或其他不必要的敏感信息。</p>
      <div className="settingsLinks"><Link href="/history">查看我的对话 →</Link><Link href="/feedback">反馈使用体验 →</Link></div>
    </section>

    <style jsx>{`
      .settingsPage{min-height:100vh;background:#f7faf8;padding:0 28px 80px;color:#20382f}.settingsPage header{height:72px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dfe8e3}.settingsPage header a,.settingsCard a{color:#2f755d;text-decoration:none;font-weight:750}.settingsPage header span,.settingsHero>span,.privacyCard>span{font-size:12px;letter-spacing:.12em;color:#4d806b;font-weight:800}.settingsHero,.settingsCard{max-width:900px;margin-left:auto;margin-right:auto}.settingsHero{margin-top:54px}.settingsHero h1{font-size:38px;line-height:1.2;margin:10px 0;color:#20382f}.settingsHero p,.settingRow p,.privacyCard p{color:#6d7e76;line-height:1.75}.settingsCard{margin-top:22px;background:#fff;border:1px solid #dfe8e3;border-radius:18px;padding:8px 26px;box-shadow:0 10px 30px rgba(36,95,76,.05)}.settingRow{display:flex;align-items:center;justify-content:space-between;gap:24px;padding:21px 0;border-bottom:1px solid #edf2ef}.settingRow:last-child{border-bottom:0}.settingRow strong{display:block;font-size:16px}.settingRow p{margin:5px 0 0;font-size:13.5px}.settingRow input{width:44px;height:24px;accent-color:#2f755d}.privacyCard{padding:24px 26px}.privacyCard h2{font-size:24px;margin:7px 0 8px}.settingsLinks{display:flex;gap:18px;flex-wrap:wrap;margin-top:14px}@media(max-width:700px){.settingsPage{padding-inline:14px}.settingsHero h1{font-size:31px}}
    `}</style>
  </main>;
}
