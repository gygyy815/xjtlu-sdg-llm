"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { KnowledgeGraphCard, type KnowledgeGraph } from "@/components/KnowledgeGraphCard";
import { SkillCenter } from "@/components/SkillCenter";
import { EvidenceInspector, type EvidenceCitation, type RetrievalInspectorData } from "@/components/EvidenceInspector";
import { createClientId } from "@/lib/client-id";
import { getSkill, type SkillId } from "@/lib/skills/registry";
import { recordToolHistory } from "@/lib/tool-history";
import { useProductLanguage } from "@/lib/product-language";
import { EventsIllustration, ExtractIllustration, HeroMark, SummaryIllustration, ValidityIllustration } from "@/components/UploadedUiIllustrations";
import { AGENT_SETTINGS_STORAGE_KEY, DEFAULT_AGENT_SETTINGS, normalizeAgentSettings, type AgentSettings } from "@/lib/agent-settings";

type Citation = EvidenceCitation;
type WorkspaceOption = { label: string; slug: string; name?: string };
type PreviewField = { id: string; label: string; kind: "xlsx" | "docx"; sheet?: string; address?: string };
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
  retrieval?: RetrievalInspectorData;
  attachment?: string;
  fileResult?: FileResult;
  graph?: KnowledgeGraph;
  workspace?: string;
  skill?: string;
};

type Shortcut = { label: string; prompt: string; description: string; illustration: React.ReactNode };

export default function Home() {
  const { lang, t } = useProductLanguage();
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [workspaceWarning, setWorkspaceWarning] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentMode, setAgentMode] = useState(false);
  const [agentSettings, setAgentSettings] = useState<AgentSettings>(DEFAULT_AGENT_SETTINGS);
  const [skillId, setSkillId] = useState<SkillId | "">("");
  const [sessionId] = useState(() => createClientId());
  const [busy, setBusy] = useState(false);
  const [fileStage, setFileStage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<PreviewField[]>([]);
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const resultUrls = useRef<string[]>([]);
  const [answerRatings, setAnswerRatings] = useState<Record<number, "up" | "down">>({});

  const selectedWorkspace = workspaces.find((item) => item.slug === workspaceSlug);
  const account = selectedWorkspace?.label || "";
  const selectedSkill = getSkill(skillId);
  const activeSkillName = selectedSkill?.name || "";

  const shortcuts: Shortcut[] = lang === "en" ? [
    { label: "Find upcoming events", description: "See current campus activities", prompt: "Find upcoming or still-valid campus events in the current knowledge base. Organize them by event name, date/time, place, audience, registration method and source. Do not guess missing details.", illustration: <EventsIllustration /> },
    { label: "Extract event details", description: "Pull out time, place and registration", prompt: "Extract the event name, date, time, place, audience, eligibility, registration method and contact details from the most relevant article. Do not guess missing fields.", illustration: <ExtractIllustration /> },
    { label: "Summarize article", description: "Turn long content into clear points", prompt: "Create a structured summary from the most relevant article while preserving dates, names, numbers and the original source link.", illustration: <SummaryIllustration /> },
    { label: "Check validity", description: "Check whether information is still current", prompt: "Use publication date, event date and deadline to judge whether the information is still valid. Explain the evidence and uncertainty.", illustration: <ValidityIllustration /> },
  ] : [
    { label: "查找近期活动", description: "查看当前仍可参加的校园活动", prompt: "请查找当前知识库中尚未过期的近期活动，并按活动名称、时间、地点、参与对象、报名方式和来源整理。缺失信息不要推测。", illustration: <EventsIllustration /> },
    { label: "提取活动信息", description: "提取时间、地点与报名信息", prompt: "请从最相关的文章中提取活动名称、日期、时间、地点、参与对象、资格、报名方式和联系方式。缺失信息不要推测。", illustration: <ExtractIllustration /> },
    { label: "生成文章摘要", description: "把长文章整理成清晰要点", prompt: "请根据最相关的文章生成结构化摘要，并保留关键日期、名称、数字及原文链接。", illustration: <SummaryIllustration /> },
    { label: "检查信息有效性", description: "判断通知或活动是否仍有效", prompt: "请根据发布日期、活动日期和截止日期判断相关信息是否仍然有效，并说明判断依据与不确定性。", illustration: <ValidityIllustration /> },
  ];

  useEffect(() => {
    const focusChat = () => chatInputRef.current?.focus();
    window.addEventListener("xjtlu-focus-chat", focusChat);
    if (new URLSearchParams(window.location.search).get("focus") === "chat") requestAnimationFrame(focusChat);
    return () => window.removeEventListener("xjtlu-focus-chat", focusChat);
  }, []);

  useEffect(() => {
    setInstruction(lang === "en"
      ? "Fill the selected fields accurately from the knowledge base. If there is no explicit evidence, enter ‘Not explicitly stated in the document.’"
      : "请根据知识库准确填写已选择字段；没有明确证据时填写“文档未明确说明”。");
  }, [lang]);

  useEffect(() => {
    const readSettings = () => {
      try { setAgentSettings(normalizeAgentSettings(JSON.parse(localStorage.getItem(AGENT_SETTINGS_STORAGE_KEY) || "null"))); }
      catch { setAgentSettings(DEFAULT_AGENT_SETTINGS); }
    };
    readSettings();
    const onChange = (event: Event) => setAgentSettings(normalizeAgentSettings((event as CustomEvent<AgentSettings>).detail));
    window.addEventListener("xjtlu-agent-settings-change", onChange);
    window.addEventListener("storage", readSettings);
    return () => { window.removeEventListener("xjtlu-agent-settings-change", onChange); window.removeEventListener("storage", readSettings); };
  }, []);

  useEffect(() => {
    fetch("/api/config")
      .then((response) => response.json())
      .then((data) => {
        const options = Array.isArray(data.workspaces)
          ? data.workspaces.filter((item: WorkspaceOption) => item?.slug && item?.label)
          : [];
        setWorkspaces(options);

        let restoredWorkspace = "";
        let restoredMessage = "";
        try {
          const raw = localStorage.getItem("xjtlu-history-prefill");
          if (raw) {
            const parsed = JSON.parse(raw);
            restoredWorkspace = typeof parsed?.workspaceSlug === "string" ? parsed.workspaceSlug : "";
            restoredMessage = typeof parsed?.message === "string" ? parsed.message : "";
            localStorage.removeItem("xjtlu-history-prefill");
          }
        } catch {}

        setWorkspaceSlug(options.some((item: WorkspaceOption) => item.slug === restoredWorkspace) ? restoredWorkspace : (options[0]?.slug || ""));
        if (restoredMessage) setMessage(restoredMessage);
        setWorkspaceWarning(data.warning || (data.staleConfigured?.length ? t("部分旧 Workspace 配置已自动隐藏。", "Some stale Workspace entries were hidden automatically.") : ""));
      })
      .catch(() => setWorkspaceWarning(t("无法读取当前 AnythingLLM Workspace。", "Unable to load the current AnythingLLM Workspace.")));

    return () => resultUrls.current.forEach(URL.revokeObjectURL);
  }, [t]);

  function clearActiveSkill() {
    setSkillId("");
  }

  async function sendText(value: string) {
    const input = value.trim();
    if (!input || busy || !account || !workspaceSlug) return;
    const skillName = selectedSkill?.name;
    setMessages((old) => [...old, { role: "user", text: input, workspace: account, skill: skillName }]);
    setMessage("");
    setBusy(true);

    try {
      if (selectedSkill?.kind === "graph") {
        const response = await fetch("/api/skills/knowledge-graph", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: input, account, workspaceSlug, sessionId }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || t("知识图谱生成失败。", "Knowledge Graph generation failed."));
        setMessages((old) => [...old, {
          role: "assistant",
          text: data.graph?.summary || t("已根据检索内容生成关系图。", "A relationship graph was generated from the retrieved evidence."),
          graph: data.graph,
          citations: data.citations,
          workspace: account,
          skill: skillName,
        }]);
        return;
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input, account, workspaceSlug, agentMode, agentConfig: agentSettings, sessionId, skillId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("请求失败。", "Request failed."));
      setMessages((old) => [...old, {
        role: "assistant",
        text: data.text || t("未返回内容。", "No content was returned."),
        citations: data.citations,
        retrieval: data.retrieval,
        workspace: account,
        skill: data.activeSkill || skillName,
      }]);
    } catch (error) {
      setMessages((old) => [...old, { role: "assistant", text: error instanceof Error ? error.message : t("暂时无法连接知识库。", "The knowledge base is temporarily unavailable.") }]);
    } finally {
      setBusy(false);
    }
  }

  async function send(event?: FormEvent) {
    event?.preventDefault();
    await sendText(message);
  }

  async function inspectFile(sourceFile: File) {
    setFile(sourceFile);
    setFields([]);
    setSelectedFieldIds([]);
    setFileStage(t("正在识别模板字段…", "Detecting template fields…"));
    const form = new FormData();
    form.append("file", sourceFile);
    try {
      const response = await fetch("/api/fill-file/inspect", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("模板识别失败。", "Template detection failed."));
      const detected = (data.fields || []) as PreviewField[];
      setFields(detected);
      setSelectedFieldIds(detected.map((item) => item.id));
      setFileStage(t(`已识别 ${detected.length} 个字段，请确认后再填写。`, `Detected ${detected.length} fields. Confirm them before filling.`));
    } catch (error) {
      setFileStage(error instanceof Error ? error.message : t("模板识别失败。", "Template detection failed."));
    }
  }

  async function previewXlsx(blob: Blob) {
    const XLSX = await import("xlsx");
    const book = XLSX.read(await blob.arrayBuffer(), { type: "array", cellDates: true });
    const sheetName = book.SheetNames[0];
    const rows = XLSX.utils.sheet_to_json<(string | number | null)[]>(book.Sheets[sheetName], { header: 1, raw: false, defval: "" });
    const preview = rows
      .map((row) => ({ field: String(row[0] || "").trim(), value: String(row[1] || "").trim() }))
      .filter((row) => row.field && row.value && !/Field|字段名称|Template|模板|Select the|请先选择/i.test(row.field));
    return {
      sheet: sheetName,
      rows: preview.slice(0, 12),
      filledCount: preview.length,
      missingCount: preview.filter((row) => /文档未明确说明|not stated/i.test(row.value)).length,
    };
  }

  async function fillFile() {
    if (!file || !account || !workspaceSlug || busy || !selectedFieldIds.length) return;
    const sourceFile = file;
    setBusy(true);
    setFileStage(t(`正在检索“${account}”并填写 ${selectedFieldIds.length} 个字段…`, `Searching “${account}” and filling ${selectedFieldIds.length} fields…`));
    const form = new FormData();
    form.append("file", sourceFile);
    form.append("account", account);
    form.append("workspaceSlug", workspaceSlug);
    form.append("instruction", instruction);
    form.append("selectedIds", JSON.stringify(selectedFieldIds));

    try {
      const response = await fetch("/api/fill-file", { method: "POST", body: form });
      if (!response.ok) {
        const data = await response.json();
        throw new Error(data.error || t("文件处理失败。", "File processing failed."));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      resultUrls.current.push(url);
      const kind = sourceFile.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "docx";
      const outputName = `filled-${sourceFile.name}`;
      const preview = kind === "xlsx" ? await previewXlsx(blob) : {};
      setMessages((old) => [...old,
        { role: "user", text: instruction, attachment: sourceFile.name, workspace: account, skill: t("文件填写", "File Fill") },
        { role: "assistant", text: t(`已按你确认的 ${selectedFieldIds.length} 个字段生成文件。请先核对预览与来源事实，再下载使用。`, `Generated the file using the ${selectedFieldIds.length} fields you confirmed. Review the preview and source facts before downloading.`), fileResult: { name: outputName, url, kind, ...preview }, workspace: account, skill: t("文件填写", "File Fill") },
      ]);
      recordToolHistory({ sessionId, workspace: account, workspaceSlug, tool: "file-fill", inputName: sourceFile.name, outputName, fieldCount: selectedFieldIds.length, instruction });
      setFile(null);
      setFields([]);
      setSelectedFieldIds([]);
      setFileStage("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (error) {
      setFileStage(error instanceof Error ? error.message : t("文件处理失败。", "File processing failed."));
    } finally {
      setBusy(false);
    }
  }

  function toggleField(id: string) {
    setSelectedFieldIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  async function pasteFromClipboard() {
    try {
      const text = await navigator.clipboard.readText();
      if (text) setMessage((current) => current ? `${current}\n${text}` : text);
      requestAnimationFrame(() => chatInputRef.current?.focus());
    } catch {
      chatInputRef.current?.focus();
    }
  }

  async function copyAnswer(text: string) {
    await navigator.clipboard.writeText(text);
  }

  function downloadAnswer(text: string, index: number) {
    const url = URL.createObjectURL(new Blob([text], { type: "text/markdown;charset=utf-8" }));
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `we-know-answer-${index + 1}.md`;
    anchor.click();
    URL.revokeObjectURL(url);
  }

  async function rateAnswer(index: number, rating: "up" | "down", item: Message) {
    setAnswerRatings((current) => ({ ...current, [index]: rating }));
    const payload = {
      id: `answer-rating-${Date.now()}`,
      type: "answer-rating",
      rating,
      sessionId,
      workspace: item.workspace || account,
      answer: item.text,
      question: [...messages].slice(0, index).reverse().find((messageItem) => messageItem.role === "user")?.text || "",
      createdAt: new Date().toISOString(),
    };
    try {
      const response = await fetch("/api/feedback", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ kind: "quick", payload }) });
      const data = await response.json();
      if (response.ok && data.stored) return;
    } catch {}
    const key = "xjtlu-answer-ratings-v1";
    try {
      const stored = JSON.parse(localStorage.getItem(key) || "[]");
      localStorage.setItem(key, JSON.stringify([payload, ...(Array.isArray(stored) ? stored : [])]));
    } catch {
      localStorage.setItem(key, JSON.stringify([payload]));
    }
  }

  return <main className="chatPage">
    <section className="chatWorkspaceBar">
      <label><span>{t("知识库", "Knowledge base")}</span><select value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)}>{workspaces.length ? workspaces.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>) : <option value="">{t("未读取到知识库", "No knowledge base available")}</option>}</select></label>
      <span className={`chatConnection ${workspaceSlug ? "connected" : ""}`}><i />{workspaceSlug ? t("已连接", "Connected") : t("未配置", "Not configured")}</span>
      {workspaceWarning && <small title={workspaceWarning}>{t("同步信息可用", "Sync information available")}</small>}
    </section>

    {!messages.length && <section className="chatHero">
      <HeroMark className="uploadedHeroMark" />
      <span>{t("可核查校园知识助手", "VERIFIABLE CAMPUS KNOWLEDGE")}</span>
      <h1>{t("你好，今天想了解什么校园信息？", "Hello, what campus information can I help you with?")}</h1>
      <p>{t("搜索官方校园知识、活动、通知和服务信息；缺少明确证据时不会推测。", "Search official campus knowledge, events, notices and services. Unsupported details are not guessed.")}</p>
      <div className="chatShortcutGrid">{shortcuts.map((item) => <button key={item.label} type="button" disabled={busy || !workspaceSlug} onClick={() => sendText(item.prompt)}><span className="chatShortcutIcon">✦</span><span className="chatShortcutCopy"><strong>{item.label}</strong><small>{item.description}</small></span><span className="chatShortcutIllustration">{item.illustration}</span></button>)}</div>
    </section>}

    <section className={`chatConversation ${!messages.length ? "empty" : ""}`} aria-live="polite">
      {!messages.length && <div className="chatEmptyState"><span>AI</span><strong>{t("问我一个校园问题", "Ask me a campus question")}</strong><p>{t("直接输入问题，或从输入框打开 Skills 选择任务能力。", "Type your question directly, or open Skills from the composer when needed.")}</p></div>}
      {messages.map((item, index) => <article key={index} className={`chatMessage ${item.role}`}>
        <div className="chatAvatar">{item.role === "user" ? t("你", "You") : "AI"}</div>
        <div className="chatMessageBody">
          {(item.workspace || item.skill) && <div className="chatMessageMeta">{item.workspace && <span>{item.workspace}</span>}{item.skill && <span>{item.skill}</span>}</div>}
          {item.role === "assistant" ? <MarkdownMessage text={item.text} /> : <p>{item.text}</p>}
          {item.attachment && <div className="attachmentChip">▦ <strong>{item.attachment}</strong></div>}
          {item.graph && <KnowledgeGraphCard graph={item.graph} citations={item.citations} />}
          {item.fileResult && <div className="fileCard">
            <div className="fileCardHead"><span className="fileIcon">{item.fileResult.kind.toUpperCase()}</span><div><strong>{item.fileResult.name}</strong><small>{t("已生成 · 请人工复核", "Generated · human review required")}</small></div></div>
            {item.fileResult.rows?.length ? <div className="sheetPreview">{item.fileResult.rows.map((row, i) => <div className="previewRow" key={i}><span>{row.field}</span><strong>{row.value}</strong></div>)}</div> : <p className="docxNote">{t("Word 文件已生成，请下载后检查表格、分页与长文本换行。", "The Word file was generated. Check tables, pagination and long-text wrapping after download.")}</p>}
            <div className="fileActions"><small>{t("使用前请核对日期、数字、邮箱、地点与原文链接。", "Review dates, numbers, email addresses, locations and source links before use.")}</small><a className="downloadButton" href={item.fileResult.url} download={item.fileResult.name}>{t("下载生成文件", "Download file")}</a></div>
          </div>}
          {!item.graph && item.role === "assistant" && <EvidenceInspector citations={item.citations} retrieval={item.retrieval} lang={lang} />}
          {item.role === "assistant" && <div className="messageActions" aria-label={t("回答操作", "Answer actions")}>
            <button type="button" onClick={() => copyAnswer(item.text)} title={t("复制回答", "Copy answer")}>⧉ <span>{t("复制", "Copy")}</span></button>
            <button type="button" onClick={() => downloadAnswer(item.text, index)} title={t("下载为 Markdown", "Download as Markdown")}>⇩ <span>{t("下载", "Download")}</span></button>
            <button type="button" className={answerRatings[index] === "up" ? "active" : ""} onClick={() => rateAnswer(index, "up", item)} aria-pressed={answerRatings[index] === "up"} title={t("回答有帮助", "Helpful answer")}>♡ <span>{t("有帮助", "Helpful")}</span></button>
            <button type="button" className={answerRatings[index] === "down" ? "active" : ""} onClick={() => rateAnswer(index, "down", item)} aria-pressed={answerRatings[index] === "down"} title={t("回答需要改进", "Answer needs improvement")}>◇ <span>{t("需改进", "Needs work")}</span></button>
          </div>}
        </div>
      </article>)}
      {busy && <div className="chatProgress"><span className="spinner" /><div><strong>{fileStage || t("正在处理…", "Processing…")}</strong><small>{t("完成后会在当前对话中返回结果。", "The result will appear in this conversation when processing is complete.")}</small></div></div>}
    </section>

    <form className="chatComposer" onSubmit={send}>
      {activeSkillName && <div className="chatSelectedSkill">✦ {t("已选择", "Selected")}: {activeSkillName}<button type="button" onClick={clearActiveSkill}>×</button></div>}
      {file && <section className="composerFilePanel" aria-label={t("文件填写任务", "File fill task")}>
        <div className="composerFileHead"><span className="fileIcon">{file.name.toLowerCase().endsWith(".xlsx") ? "XLSX" : "DOCX"}</span><div><strong>{file.name}</strong><small>{fileStage || t("准备识别字段", "Preparing field detection")}</small></div><button type="button" onClick={() => { setFile(null); setFields([]); setSelectedFieldIds([]); setFileStage(""); if (fileRef.current) fileRef.current.value = ""; }} aria-label={t("移除文件", "Remove file")}>×</button></div>
        {fields.length > 0 && <><div className="fieldToolbar"><strong>{t("选择要填写的字段", "Choose fields to fill")}</strong><span>{selectedFieldIds.length}/{fields.length}</span><button type="button" onClick={() => setSelectedFieldIds(selectedFieldIds.length === fields.length ? [] : fields.map((item) => item.id))}>{selectedFieldIds.length === fields.length ? t("取消全选", "Clear all") : t("全选", "Select all")}</button></div><div className="composerFieldList">{fields.map((field) => <label key={field.id}><input type="checkbox" checked={selectedFieldIds.includes(field.id)} onChange={() => toggleField(field.id)} /><span>{field.label}</span></label>)}</div></>}
        <label className="composerInstruction"><span>{t("填写要求", "Instructions")}</span><textarea value={instruction} rows={2} onChange={(event) => setInstruction(event.target.value)} /></label>
        <button className="composerFillButton" type="button" disabled={!selectedFieldIds.length || busy} onClick={fillFile}>{busy ? t("正在填写…", "Filling…") : t("确认字段并生成文件", "Confirm fields and generate")}</button>
      </section>}
      <textarea ref={chatInputRef} rows={3} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={selectedSkill?.kind === "graph" ? t("输入想生成关系图的主题…", "Enter a topic for the relationship graph…") : t("输入你想了解的校园信息…", "Ask about campus information…")} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
      <div className="chatComposerActions">
        <button type="button" onClick={() => fileRef.current?.click()} title={t("选择 Word 或 Excel 模板", "Choose a Word or Excel template")}>＋ {t("选择文件", "Choose file")}</button>
        <input ref={fileRef} hidden type="file" accept=".xlsx,.docx" onChange={(event) => { const next = event.target.files?.[0]; if (next) inspectFile(next); }} />
        <button type="button" onClick={pasteFromClipboard} title={t("粘贴剪贴板内容", "Paste clipboard contents")}>⌘ {t("粘贴", "Paste")}</button>
        <button type="button" className={`composerAgentButton ${agentMode ? "active" : ""}`} onClick={() => setAgentMode((value) => !value)} aria-pressed={agentMode} title={agentMode ? agentSettings.name : t("启用 Agent 模式", "Enable Agent mode")}>✦ Agent</button>
        <button type="button" className="chatSkillButton" onClick={() => window.dispatchEvent(new Event("xjtlu-open-skill-drawer"))}>✦ {t("技能", "Skills")}</button>
        <button className="chatSendButton" aria-label={t("发送", "Send")} title={t("发送", "Send")} disabled={busy || !message.trim() || !workspaceSlug}><svg viewBox="0 0 24 24" aria-hidden="true"><path d="m5 12 14-7-4 14-3-6-7-1Z"/><path d="m12 13 7-8"/></svg></button>
      </div>
    </form>

    <SkillCenter selected={skillId} onSelect={setSkillId} />

  </main>;
}
