"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { UserPageShell } from "@/components/UserPageShell";
import {
  AGENT_SETTINGS_STORAGE_KEY,
  DEFAULT_AGENT_SETTINGS,
  normalizeAgentSettings,
  type AgentSettings,
} from "@/lib/agent-settings";

export default function AgentSettingsPage() {
  const [settings, setSettings] = useState<AgentSettings>(DEFAULT_AGENT_SETTINGS);
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(AGENT_SETTINGS_STORAGE_KEY) || "null");
      if (parsed) setSettings(normalizeAgentSettings(parsed));
    } catch {}
  }, []);

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
    <div className="agentSettingsConsumer">
      <section className="agentIntro">
        <div>
          <span className="consumerEyebrow">AGENT SETTINGS</span>
          <h1>让助手按你希望的方式回答</h1>
          <p>设置 Agent 的名称和回答规则。只有聊天页打开 Agent 模式后，这些设置才会生效；普通问答仍继续使用现有 AnythingLLM 知识库。</p>
        </div>
        <span className="saveState">{saved ? "✓ 已保存" : "保存在当前浏览器"}</span>
      </section>

      <div className="agentSettingsGrid">
        <section className="agentPrimaryCard">
          <h2>我的 Agent</h2>
          <p>这里控制 Agent 的身份和回答方式，不改变知识库内容。</p>

          <label className="agentField">
            <span>Agent 名称</span>
            <input
              value={settings.name}
              maxLength={80}
              onChange={(event) => update("name", event.target.value)}
              placeholder="XJTLU Campus Assistant"
            />
            <small>名称会在聊天页开启 Agent 模式后显示。</small>
          </label>

          <label className="agentField">
            <span>系统提示词（System Prompt）</span>
            <textarea
              rows={13}
              value={settings.systemPrompt}
              onChange={(event) => update("systemPrompt", event.target.value)}
              placeholder="输入希望 Agent 始终遵守的回答规则…"
            />
            <small>建议写清楚：只能依据知识库回答、缺失信息不推测、保留日期数字与原文链接等规则。</small>
          </label>

          <div className="agentActions">
            <button type="button" className="secondary" onClick={reset}>恢复默认</button>
            <button type="button" className="primary" onClick={save}>保存设置</button>
          </div>
        </section>

        <aside className="agentSideCard">
          <h2>回答方式</h2>
          <p>保持简单：知识库仍由聊天页选择，这里只控制 Agent 行为。</p>

          <div className="agentKbNote">
            <strong>知识库跟随当前聊天</strong>
            <p>Agent 会使用聊天页顶部当前选中的 AnythingLLM Workspace，不需要在这里重复配置。</p>
          </div>

          <span className="agentAdvancedLabel">高级选项</span>
          <div className="agentOption">
            <div>
              <strong>使用 AnythingLLM 原生 Agent</strong>
              <p>开启后继续调用原生 @agent；关闭后仍使用 AnythingLLM，但采用“提示词 + RAG”的普通聊天链路。</p>
            </div>
            <input
              type="checkbox"
              checked={settings.nativeAnythingLLMAgent}
              onChange={(event) => update("nativeAnythingLLMAgent", event.target.checked)}
            />
          </div>

          <div className="agentTipList">
            <div className="agentTip"><span>1</span><div><strong>先保存设置</strong><small>修改 Prompt 后点击“保存设置”。</small></div></div>
            <div className="agentTip"><span>2</span><div><strong>回到聊天页</strong><small>选择你需要使用的知识库。</small></div></div>
            <div className="agentTip"><span>3</span><div><strong>打开 Agent 模式</strong><small>下一次提问就会使用新的 Agent 规则。</small></div></div>
          </div>

          <Link className="consumerPageAction" href="/">返回聊天并测试 →</Link>
        </aside>
      </div>
    </div>
  </UserPageShell>;
}
