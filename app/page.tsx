"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { MarkdownMessage } from "../components/MarkdownMessage";

type Citation = { title: string; text?: string; url?: string };
type FileResult = {
  name: string;
  url: string;
  kind: "xlsx" | "docx";
  sheet?: string;
  rows?: { field: string; value: string }[];
  filledCount?: number;
  missingCount?: number;
};
type Message = {
  role: "user" | "assistant";
  text: string;
  citations?: Citation[];
  attachment?: string;
  fileResult?: FileResult;
};
const shortcuts = ["查找近期活动", "提取时间与地点", "检查活动是否过期", "分析相关 SDG", "生成中英文摘要"];

export default function Home() {
  const [accounts, setAccounts] = useState<string[]>([]);
  const [account, setAccount] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentMode, setAgentMode] = useState(false);
  const [busy, setBusy] = useState(false);
  const [fileStage, setFileStage] = useState("");
  const [fileOpen, setFileOpen] = useState(false);
  const [file, setFile] = useState<File | null>(null);
  const [instruction, setInstruction] = useState("请根据知识库准确填写所有待填字段；没有明确证据时填写“文档未明确说明”。");
  const fileRef = useRef<HTMLInputElement>(null);
  const resultUrls = useRef<string[]>([]);

  useEffect(() => {
    fetch("/api/config").then(r => r.json()).then(data => {
      setAccounts(data.accounts || []);
      setAccount(data.accounts?.[0] || "");
    });
    return () => resultUrls.current.forEach(URL.revokeObjectURL);
  }, []);

  async function send(event?: FormEvent) {
    event?.preventDefault();
    const input = message.trim();
    if (!input || busy) return;
    setMessages(old => [...old, { role: "user", text: input }]);
    setMessage("");
    setBusy(true);
    try {
      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input, account, agentMode }),
      });
      const data = await response.json();
      setMessages(old => [...old, { role: "assistant", text: data.text || data.error || "请求失败。", citations: data.citations }]);
    } catch {
      setMessages(old => [...old, { role: "assistant", text: "暂时无法连接知识库，请稍后重试。" }]);
    } finally {
      setBusy(false);
    }
  }

  async function previewXlsx(blob: Blob) {
    const XLSX = await import("xlsx");
    const book = XLSX.read(await blob.arrayBuffer(), { type: "array", cellDates: true });
    const sheetName = book.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(book.Sheets[sheetName], {
      header: 1,
      raw: false,
      defval: "",
    });
    const preview = rows
      .map(row => ({ field: String(row[0] || "").trim(), value: String(row[1] || "").trim() }))
      .filter(row => row.field && row.value && !/Field|字段名称|Template|模板|Select the|请先选择/i.test(row.field));
    return {
      sheet: sheetName,
      rows: preview.slice(0, 12),
      filledCount: preview.length,
      missingCount: preview.filter(row => /文档未明确说明|not stated/i.test(row.value)).length,
    };
  }

  async function fillFile() {
    if (!file || !account || busy) return;
    const sourceFile = file;
    setFileOpen(false);
    setMessages(old => [...old, {
      role: "user",
      text: instruction,
      attachment: sourceFile.name,
    }]);
    setBusy(true);
    setFileStage("正在读取模板并识别待填字段…");
    const form = new FormData();
    form.append("file", sourceFile);
    form.append("account", account);
    form.append("instruction", instruction);
    try {
      setFileStage(`正在检索“${account}”知识库并生成内容…`);
      const response = await fetch("/api/fill-file", { method: "POST", body: form });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || "文件处理失败。");
      }
      setFileStage("正在整理预览与下载文件…");
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      resultUrls.current.push(url);
      const kind = sourceFile.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "docx";
      const outputName = `filled-${sourceFile.name}`;
      const preview = kind === "xlsx" ? await previewXlsx(blob) : {};
      setMessages(old => [...old, {
        role: "assistant",
        text: "文件已经生成。我先把结果放在对话中供你核对；确认预览内容后再下载使用。",
        fileResult: { name: outputName, url, kind, ...preview },
      }]);
      setFile(null);
      if (fileRef.current) fileRef.current.value = "";
    } catch (error) {
      setMessages(old => [...old, {
        role: "assistant",
        text: error instanceof Error ? error.message : "文件处理失败。",
      }]);
    } finally {
      setBusy(false);
      setFileStage("");
    }
  }

  return <main className="shell">
    <header>
      <div className="brand"><span className="logo">XJ</span><div><strong>Campus Knowledge Assistant</strong><small>SURF-2026-0395</small></div></div>
      <select value={account} onChange={e => setAccount(e.target.value)} aria-label="选择公众号知识库">
        {accounts.length ? accounts.map(item => <option key={item}>{item}</option>) : <option>请先配置知识库</option>}
      </select>
    </header>
    <section className="hero"><span className="eyebrow">XJTLU CAMPUS INFORMATION</span><h1>你好，我可以帮你查找校园信息</h1><p>选择微信公众号知识库，询问活动、通知、来源与 SDG 信息。</p></section>
    <div className="shortcutRow">{shortcuts.map(item => <button key={item} onClick={() => setMessage(item)}>{item}</button>)}</div>
    <section className="conversation" aria-live="polite">
      {!messages.length && <div className="empty"><span>✦</span><p>回答只依据已选知识库，并展示可核查来源。</p></div>}
      {messages.map((item, index) => <article key={index} className={`message ${item.role}`}>
        <div className="avatar">{item.role === "user" ? "你" : "AI"}</div>
        <div>
          {item.role === "assistant" ? <MarkdownMessage text={item.text} /> : <p>{item.text}</p>}
          {item.attachment && <div className="attachmentChip"><span>▦</span><div><b>{item.attachment}</b><small>已提交至所选知识库填写</small></div></div>}
          {item.fileResult && <div className="fileCard">
            <div className="fileCardHead">
              <span className="fileIcon">{item.fileResult.kind === "xlsx" ? "XLSX" : "DOCX"}</span>
              <div><b>{item.fileResult.name}</b><small>已生成 · 待人工复核</small></div>
            </div>
            {item.fileResult.rows?.length ? <>
              <div className="fileStats"><span>工作表：{item.fileResult.sheet}</span><span>已填写 {item.fileResult.filledCount} 项</span><span>缺少证据 {item.fileResult.missingCount} 项</span></div>
              <div className="sheetPreview">
                {item.fileResult.rows.map((row, i) => <div className="previewRow" key={i}><span>{row.field}</span><strong className={/文档未明确说明|not stated/i.test(row.value) ? "missing" : ""}>{row.value}</strong></div>)}
              </div>
              {(item.fileResult.filledCount || 0) > 12 && <small className="previewNote">当前展示前 12 项，下载后可查看完整内容。</small>}
            </> : <p className="docxNote">Word 文件已按占位符生成。下载后请在 Word 中检查分页、表格和长文本换行。</p>}
            <div className="fileActions"><a className="downloadButton" href={item.fileResult.url} download={item.fileResult.name}>下载生成文件</a><small>请重点核对日期、数字、邮箱与原文链接</small></div>
          </div>}
          {item.citations?.length ? <div className="citations">{item.citations.map((source, i) => <a key={i} href={source.url || "#"} target={source.url ? "_blank" : undefined} rel={source.url ? "noreferrer" : undefined}><b>来源 {i + 1}</b><span>{source.title}</span></a>)}</div> : null}
        </div>
      </article>)}
      {busy && <div className="progressCard"><span className="spinner" /><div><b>{fileStage || "正在处理…"}</b><small>请保持页面打开，完成后将在对话中返回结果。</small></div></div>}
    </section>
    <form className="composer" onSubmit={send}>
      <textarea value={message} onChange={e => setMessage(e.target.value)} placeholder="输入你想了解的校园信息…" onKeyDown={e => { if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); send(); } }} />
      <div className="actions"><div><button type="button" className="iconButton" onClick={() => setFileOpen(true)}>＋ 文件填写</button><label className="toggle"><input type="checkbox" checked={agentMode} onChange={e => setAgentMode(e.target.checked)} /> Agent 模式</label></div><button className="send" disabled={busy || !message.trim()}>发送</button></div>
    </form>
    {fileOpen && <div className="modal" role="dialog"><div className="panel">
      <button className="close" onClick={() => setFileOpen(false)}>×</button>
      <h2>上传并填写文件</h2>
      <p>支持 Excel（左侧标签、右侧空白待填）和含 <code>{"{{字段名}}"}</code> 占位符的 Word 模板，最大 10 MB。</p>
      <input ref={fileRef} type="file" accept=".xlsx,.docx" onChange={e => setFile(e.target.files?.[0] || null)} />
      <textarea value={instruction} onChange={e => setInstruction(e.target.value)} />
      <button className="primary" disabled={!file || busy} onClick={fillFile}>{busy ? "正在填写…" : "开始智能填写"}</button>
      <small>完成后将在对话中显示预览和下载按钮；生成内容必须人工复核。</small>
    </div></div>}
  </main>;
}
