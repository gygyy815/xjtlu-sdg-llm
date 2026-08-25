"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
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

  return <main className="agentSettingsPage">
    <header>
      <Link href="/">← 返回助手</Link>
      <span>{saved ? "已保存" : "Agent 设置"}</span>
    </header>

    <section className="hero">
      <span>AGENT CONFIGURATION</span>
      <h1>配置 Agent，而不改动普通 AnythingLLM 问答链路</h1>
      <p>这里的配置只在聊天页打开“Agent 模式”后生效。关闭 Agent 模式时，系统继续使用现有 AnythingLLM Workspace、RAG 检索和普通问答流程。</p>
    </section>

    <section className="card">
      <label className="field">
        <span>Agent 名称</span>
        <input value={settings.name} maxLength={80} onChange={(event) => update("name", event.target.value)} placeholder="XJTLU Campus Assistant" />
        <small>用于区分当前 Agent 配置，不影响 AnythingLLM Workspace 名称。</small>
      </label>

      <label className="field">
        <span>System Prompt</span>
        <textarea rows={13} value={settings.systemPrompt} onChange={(event) => update("systemPrompt", event.target.value)} placeholder="输入 Agent 的系统提示词…" />
        <small>Agent 模式开启后，这段提示词会随请求发送；普通模式不会读取它。</small>
      </label>

      <div className="settingRow">
        <div>
          <strong>使用 AnythingLLM 原生 @agent</strong>
          <p>开启：保留当前原生 Agent 行为，并把上面的提示词作为 Agent 指令传入。关闭：仍使用 AnythingLLM，但走更可控的“提示词 + RAG”聊天链路，不触发 @agent。</p>
        </div>
        <input type="checkbox" checked={settings.nativeAnythingLLMAgent} onChange={(event) => update("nativeAnythingLLMAgent", event.target.checked)} />
      </div>

      <div className="notice">
        <strong>知识库无需在这里重复配置</strong>
        <p>Agent 会继续使用聊天页顶部当前选择的 AnythingLLM Workspace。这样关闭 Agent 模式时，原有知识库问答不受影响。</p>
      </div>

      <div className="actions">
        <button type="button" className="secondary" onClick={reset}>恢复默认</button>
        <button type="button" className="primary" onClick={save}>保存 Agent 设置</button>
      </div>
    </section>

    <section className="card compact">
      <span className="eyebrow">当前设计</span>
      <h2>只增加一层 Agent 配置，不替换 AnythingLLM</h2>
      <div className="flow">
        <div><strong>Agent OFF</strong><small>现有 AnythingLLM RAG</small></div>
        <b>→</b>
        <div><strong>Agent ON</strong><small>Agent Prompt + 当前 Workspace + AnythingLLM</small></div>
      </div>
    </section>

    <style jsx>{`
      .agentSettingsPage{min-height:100vh;background:#f6faf8;padding:0 28px 80px;color:#20382f}.agentSettingsPage header{height:72px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #dfe8e3}.agentSettingsPage header a{color:#2f755d;text-decoration:none;font-weight:780}.agentSettingsPage header span,.hero>span,.eyebrow{font-size:12px;letter-spacing:.12em;color:#4d806b;font-weight:850}.hero,.card{max-width:920px;margin-left:auto;margin-right:auto}.hero{margin-top:50px}.hero h1{font-size:38px;line-height:1.2;margin:10px 0;color:#20382f}.hero p,.field small,.settingRow p,.notice p,.flow small{color:#6d7e76;line-height:1.7}.card{margin-top:22px;background:#fff;border:1px solid #dfe8e3;border-radius:20px;padding:26px;box-shadow:0 10px 30px rgba(36,95,76,.05)}.field{display:block;margin-bottom:24px}.field>span{display:block;font-weight:800;margin-bottom:8px}.field input,.field textarea{width:100%;box-sizing:border-box;border:1px solid #cfded6;border-radius:12px;padding:12px 14px;font:inherit;color:#20382f;background:#fbfdfc;outline:none}.field textarea{resize:vertical;min-height:250px;line-height:1.65}.field input:focus,.field textarea:focus{border-color:#4c8f73;box-shadow:0 0 0 3px rgba(76,143,115,.12)}.field small{display:block;margin-top:7px;font-size:12.5px}.settingRow{display:flex;align-items:center;justify-content:space-between;gap:28px;padding:20px 0;border-top:1px solid #edf2ef;border-bottom:1px solid #edf2ef}.settingRow strong{font-size:16px}.settingRow p{margin:6px 0 0;font-size:13.5px;max-width:720px}.settingRow input{width:46px;height:25px;accent-color:#2f755d;flex:0 0 auto}.notice{margin-top:20px;padding:16px 18px;border-radius:14px;background:#eef7f2;border:1px solid #d7e9df}.notice p{margin:5px 0 0;font-size:13.5px}.actions{display:flex;justify-content:flex-end;gap:12px;margin-top:24px}.actions button{border-radius:11px;padding:11px 18px;font-weight:800;cursor:pointer}.secondary{background:#fff;border:1px solid #cddbd4;color:#47685a}.primary{background:#2f755d;border:1px solid #2f755d;color:#fff}.compact{padding:24px 26px}.compact h2{margin:7px 0 18px;font-size:23px}.flow{display:grid;grid-template-columns:1fr auto 1fr;gap:16px;align-items:center}.flow div{background:#f7faf8;border:1px solid #e0e9e4;border-radius:14px;padding:16px}.flow strong,.flow small{display:block}.flow b{color:#5c8d77}@media(max-width:700px){.agentSettingsPage{padding-inline:14px}.hero h1{font-size:30px}.settingRow{align-items:flex-start}.flow{grid-template-columns:1fr}.flow>b{display:none}.actions{flex-direction:column-reverse}.actions button{width:100%}}
    `}</style>
  </main>;
}
