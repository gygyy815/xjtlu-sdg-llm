"use client";

import { FormEvent, useEffect, useRef, useState } from "react";

type Message = { role: "user" | "assistant"; text: string; citations?: { title: string; text?: string; url?: string }[] };
const shortcuts = ["查找近期活动", "提取时间与地点", "检查活动是否过期", "分析相关 SDG", "生成中英文摘要"];

export default function Home() {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [account, setAccount] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentMode, setAgentMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [instruction, setInstruction] = useState("请根据知识库准确填写所有待填字段；没有明确证据时填写“文档未明确说明”。");
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => { fetch("/api/config").then(r => r.json()).then(data => { setAccounts(data.accounts || []); setAccount(data.accounts?.[0] || ""); }); }, []);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const input = message.trim();
    if (!input || busy) return;
    setMessages(old => [...old, { role: "user", text: input }]); setMessage(""); setBusy(true);
    try {
      const response = await fetch("/api/chat", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ message: input, account, agentMode }) });
      const data = await response.json();
      setMessages(old => [...old, { role: "assistant", text: data.text || data.error || "请求失败。", citations: data.citations }]);
    } catch { setMessages(old => [...old, { role: "assistant", text: "暂时无法连接知识库，请稍后重试。" }]); }
    finally { setBusy(false); }
  }

  async function fillFile() {
    if (!file || !account || busy) return;
    setBusy(true);
    const form = new FormData(); form.append("file", file); form.append("account", account); form.append("instruction", instruction);
    try {
      const response = await fetch("/api/fill-file", { method: "POST", body: form });
      if (!response.ok) { const data = await response.json(); throw new Error(data.error || "文件处理失败。"); }
      const blob = await response.blob(); const url = URL.createObjectURL(blob); const link = document.createElement("a");
      link.href = url; link.download = `filled-${file.name}`; link.click(); URL.revokeObjectURL(url);
      setMessages(old => [...old, { role: "assistant", text: `已根据“${account}”知识库填写 ${file.name}，文件已开始下载。请人工核对日期、数字与引用后再使用。` }]);
      setFileOpen(false); setFile(null);
    } catch (error) { setMessages(old => [...old, { role: "assistant", text: error instanceof Error ? error.message : "文件处理失败。" }]); }
    finally { setBusy(false); }
  }

  return <main className="shell">
    <header><div className="brand"><span className="logo">XJ</span><div><strong>Campus Knowledge Assistant</strong><small>SURF-2026-0395</small></div></div><select value={account} onChange={e => setAccount(e.target.value)} aria-label="选择公众号知识库">{accounts.length ? accounts.map(item => <option key={item}>{item}</option>) : <option>请先配置知识库</option>}</select></header>
    <section className="hero"><span className="eyebrow">XJTLU CAMPUS INFORMATION</span><h1>你好，我可以帮你查找校园信息</h1><p>选择微信公众号知识库，询问活动、通知、来源与 SDG 信息。</p></section>
    <div className="shortcutRow">{shortcuts.map(item => <button key={item} onClick={() => setMessage(item)}>{item}</button>)}</div>
    <section className="conversation" aria-live="polite">
      {!messages.length && <div className="empty"><span>✦</span><p>回答只依据已选知识库，并展示可核查来源。</p></div>}
      {messages.map((item, index) => <article key={index} className={`message ${item.role}`}><div className="avatar">{item.role === "user" ? "你" : "AI"}</div><div><p>{item.text}</p>{item.citations?.length ? <div className="citations">{item.citations.map((source, i) => <a key={i} href={source.url || "#"} target={source.url ? "_blank" : undefined}><b>来源 {i + 1}</b><span>{source.title}</span></a>)}</div> : null}</div></article>)}
      {busy && <div className="loading">正在处理…</div>}
    </section>
    <form className="composer" onSubmit={send}><textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="输入你想了解的校园信息…" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} /><div className="actions"><div><button type="button" className="iconButton" onClick={() => setFileOpen(true)}>＋ 文件填写</button><label className="toggle"><input type="checkbox" checked={agentMode} onChange={e => setAgentMode(e.target.checked)} /> Agent 模式</label></div><button className="send" disabled={busy || !message.trim()}>发送</button></div></form>
    {fileOpen && <div className="modal" role="dialog"><div className="panel"><button className="close" onClick={() => setFileOpen(false)}>×</button><h2>上传并填写文件</h2><p>支持 Excel（左侧标签、右侧空白待填）和含 <code>{"{{字段名}}"}</code> 占位符的 Word 模板，最大 10 MB。</p><input ref={fileRef} type="file" accept=".xlsx,.docx" onChange={e => setFile(e.target.files?.[0] || null)} /><textarea value={instruction} onChange={e => setInstruction(e.target.value)} /><button className="primary" disabled={!file || busy} onClick={fillFile}>{busy ? "正在填写…" : "填写并下载"}</button><small>生成内容必须人工复核；系统不会把 API Key 暴露给浏览器。</small></div></div>}
  </main>;
}
