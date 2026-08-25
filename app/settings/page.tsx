"use client";

import { useEffect, useState } from "react";
import { useProductLanguage } from "@/lib/product-language";

const SKILL_COLLAPSE_KEY = "xjtlu-skill-rail-collapsed";
const SETTINGS_KEY = "xjtlu-ui-settings-v1";

type UiSettings = { compactMode: boolean; rememberLastSkill: boolean; showEvidenceFirst: boolean };
const defaults: UiSettings = { compactMode: false, rememberLastSkill: true, showEvidenceFirst: true };

export default function SettingsPage() {
  const { t } = useProductLanguage();
  const [skillCollapsed, setSkillCollapsed] = useState(true);
  const [settings, setSettings] = useState<UiSettings>(defaults);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      setSkillCollapsed(localStorage.getItem(SKILL_COLLAPSE_KEY) !== "0");
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

  return <main className="settingsPage cleanPage">
    <section className="cleanPageHeader">
      <span>{t("我的偏好", "PREFERENCES")}</span>
      <h1>{t("把校园助手调整成你更顺手的样子", "Make the campus assistant work the way you prefer")}</h1>
      <p>{t("这些设置只影响当前浏览器中的显示和使用习惯，不会改变 AnythingLLM 知识库。", "These settings only affect this browser's display and interaction preferences. They do not change the AnythingLLM knowledge base.")}</p>
      {saved && <div className="savedNotice">✓ {t("已保存", "Saved")}</div>}
    </section>

    <section className="settingsCard cleanCard">
      <div className="settingRow"><div><strong>{t("默认收起技能", "Collapse Skills by default")}</strong><p>{t("保持聊天界面简洁，需要时再从输入框打开 Skills。", "Keep chat clean and open Skills from the composer only when needed.")}</p></div><input type="checkbox" checked={skillCollapsed} onChange={(e) => persistSkillCollapsed(e.target.checked)} /></div>
      <div className="settingRow"><div><strong>{t("紧凑显示", "Compact spacing")}</strong><p>{t("减少部分卡片和内容间距，适合较小屏幕。", "Reduce spacing between cards and sections on smaller screens.")}</p></div><input type="checkbox" checked={settings.compactMode} onChange={(e) => update("compactMode", e.target.checked)} /></div>
      <div className="settingRow"><div><strong>{t("记住上次使用的技能", "Remember the last skill")}</strong><p>{t("下次使用时保留你最近选择的工具偏好。", "Keep your most recently selected tool preference for the next session.")}</p></div><input type="checkbox" checked={settings.rememberLastSkill} onChange={(e) => update("rememberLastSkill", e.target.checked)} /></div>
      <div className="settingRow"><div><strong>{t("优先展示来源证据", "Show source evidence first")}</strong><p>{t("回答中优先显示来源、日期和可核查信息。", "Prioritize sources, dates and verifiable evidence in answers.")}</p></div><input type="checkbox" checked={settings.showEvidenceFirst} onChange={(e) => update("showEvidenceFirst", e.target.checked)} /></div>
    </section>

    <section className="settingsCard privacyCard cleanCard">
      <span>{t("隐私说明", "PRIVACY")}</span>
      <h2>{t("当前 Demo 的本地记录仅保存在这个浏览器中", "Local demo records stay in this browser")}</h2>
      <p>{t("对话历史与部分工具记录按当前浏览器会话隔离。不要在 Demo 中输入密码、证件号码或其他不必要的敏感信息。", "Chat history and some tool records are isolated to the current browser session. Do not enter passwords, ID numbers or other unnecessary sensitive information.")}</p>
      <div className="settingsLinks"><button type="button" className="textAction" onClick={() => { window.location.href = "/history"; }}>{t("查看我的对话 →", "View my chats →")}</button><button type="button" className="textAction" onClick={() => { window.location.href = "/feedback"; }}>{t("反馈使用体验 →", "Share feedback →")}</button></div>
    </section>
  </main>;
}
