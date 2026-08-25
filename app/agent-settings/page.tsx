"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UserPageShell } from "@/components/UserPageShell";
import type { UiLang } from "@/lib/ui-i18n";
import {
  AGENT_SETTINGS_STORAGE_KEY,
  DEFAULT_AGENT_SETTINGS,
  normalizeAgentSettings,
  type AgentSettings,
} from "@/lib/agent-settings";

export default function AgentSettingsPage() {
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_AGENT_SETTINGS);
  const [saved, setSaved] = useState(false);
  const [lang, setLang] = useState<UiLang>("zh");

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(AGENT_SETTINGS_STORAGE_KEY) || "null");
      if (parsed) setSettings(normalizeAgentSettings(parsed));
    } catch {}

    const readLanguage = () => setLang(localStorage.getItem("xjtlu-ui-language") === "en" ? "en" : "zh");
    readLanguage();
    const onLanguage = (event: Event) => {
      setLang((event as CustomEvent<{ lang?: UiLang }>).detail?.lang === "en" ? "en" : "zh");
    };
    window.addEventListener("xjtlu-ui-language-change", onLanguage);
    window.addEventListener("storage", readLanguage);
    return () => {
      window.removeEventListener("xjtlu-ui-language-change", onLanguage);
      window.removeEventListener("storage", readLanguage);
    };
  }, []);

  const t = (zh: string, en: string) => lang === "en" ? en : zh;

  function update<K extends keyof AgentSettings>(key: K, value: AgentSettings[K]) {
    setSettings((current) => ({ ...current, [key]: value }));
    setSaved(false);
  }

  function save() {
    const normalized = normalizeAgentSettings(settings);
    setSettings(normalized);
    localStorage.setItem(AGENT_SETTINGS_STORAGE_KEY, JSON.stringify(normalized));
    window.dispatchEvent(new CustomEvent("xjtlu-agent-settings-change", { detail: normalized }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  function reset() {
    setSettings(DEFAULT_AGENT_SETTINGS);
    localStorage.setItem(AGENT_SETTINGS_STORAGE_KEY, JSON.stringify(DEFAULT_AGENT_SETTINGS));
    window.dispatchEvent(new CustomEvent("xjtlu-agent-settings-change", { detail: DEFAULT_AGENT_SETTINGS }));
    setSaved(true);
    window.setTimeout(() => setSaved(false), 1400);
  }

  return <UserPageShell>
    <div className="agentSettingsConsumer" data-no-ui-translate>
      <section className="agentIntro">
        <div>
          <span className="consumerEyebrow">AGENT SETTINGS</span>
          <h1>{t("让助手按你希望的方式回答", "Make the assistant respond the way you want")}</h1>
          <p>{t(
            "设置 Agent 的名称和回答规则。只有聊天页打开 Agent 模式后，这些设置才会生效；普通问答仍继续使用现有 AnythingLLM 知识库。",
            "Set the Agent name and response rules. These settings only apply when Agent mode is enabled in chat; normal Q&A continues to use the existing AnythingLLM knowledge base.",
          )}</p>
        </div>
        <span className="saveState">{saved ? t("✓ 已保存", "✓ Saved") : t("保存在当前浏览器", "Saved in this browser")}</span>
      </section>

      <div className="agentSettingsGrid">
        <section className="agentPrimaryCard">
          <h2>{t("我的 Agent", "My Agent")}</h2>
          <p>{t("这里控制 Agent 的身份和回答方式，不改变知识库内容。", "Control the Agent identity and response style here without changing knowledge-base content.")}</p>

          <label className="agentField">
            <span>{t("Agent 名称", "Agent name")}</span>
            <input
              value={settings.name}
              maxLength={80}
              onChange={(event) => update("name", event.target.value)}
              placeholder="XJTLU Campus Assistant"
            />
            <small>{t("名称会在聊天页开启 Agent 模式后显示。", "The name is shown in chat when Agent mode is enabled.")}</small>
          </label>

          <label className="agentField">
            <span>{t("系统提示词（System Prompt）", "System Prompt")}</span>
            <textarea
              rows={13}
              value={settings.systemPrompt}
              onChange={(event) => update("systemPrompt", event.target.value)}
              placeholder={t("输入希望 Agent 始终遵守的回答规则…", "Enter the rules the Agent should always follow…")}
            />
            <small>{t(
              "建议写清楚：只能依据知识库回答、缺失信息不推测、保留日期数字与原文链接等规则。",
              "Recommended rules include: answer only from the knowledge base, do not guess missing information, and preserve dates, numbers and original links.",
            )}</small>
          </label>

          <div className="agentActions">
            <button type="button" className="secondary" onClick={reset}>{t("恢复默认", "Reset")}</button>
            <button type="button" className="primary" onClick={save}>{t("保存设置", "Save settings")}</button>
          </div>
        </section>

        <aside className="agentSideCard">
          <h2>{t("回答方式", "Response mode")}</h2>
          <p>{t("保持简单：知识库仍由聊天页选择，这里只控制 Agent 行为。", "Keep it simple: choose the knowledge base in chat; this page only controls Agent behavior.")}</p>

          <div className="agentKbNote">
            <strong>{t("知识库跟随当前聊天", "Use the knowledge base selected in chat")}</strong>
            <p>{t(
              "Agent 会使用聊天页顶部当前选中的 AnythingLLM Workspace，不需要在这里重复配置。",
              "The Agent uses the AnythingLLM Workspace currently selected at the top of the chat page, so it does not need to be configured again here.",
            )}</p>
          </div>

          <span className="agentAdvancedLabel">{t("高级选项", "Advanced")}</span>
          <div className="agentOption">
            <div>
              <strong>{t("使用 AnythingLLM 原生 Agent", "Use native AnythingLLM Agent")}</strong>
              <p>{t(
                "开启后继续调用原生 @agent；关闭后仍使用 AnythingLLM，但采用“提示词 + RAG”的普通聊天链路。",
                "When enabled, the native @agent path is used. When disabled, AnythingLLM is still used through the regular prompt + RAG chat path.",
              )}</p>
            </div>
            <input
              type="checkbox"
              checked={settings.nativeAnythingLLMAgent}
              onChange={(event) => update("nativeAnythingLLMAgent", event.target.checked)}
            />
          </div>

          <div className="agentTipList">
            <div className="agentTip"><span>1</span><div><strong>{t("先保存设置", "Save first")}</strong><small>{t("修改 Prompt 后点击“保存设置”。", "After editing the prompt, click Save settings.")}</small></div></div>
            <div className="agentTip"><span>2</span><div><strong>{t("回到聊天页", "Return to chat")}</strong><small>{t("选择你需要使用的知识库。", "Choose the knowledge base you want to use.")}</small></div></div>
            <div className="agentTip"><span>3</span><div><strong>{t("打开 Agent 模式", "Enable Agent mode")}</strong><small>{t("下一次提问就会使用新的 Agent 规则。", "Your next question will use the updated Agent rules.")}</small></div></div>
          </div>

          <Link className="consumerPageAction" href="/">{t("返回聊天并测试 →", "Back to chat and test →")}</Link>
        </aside>
      </div>
    </div>
  </UserPageShell>;
}
