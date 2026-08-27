"use client";

import { FormEvent, useEffect, useRef, useState } from "react";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { KnowledgeGraphCard, type KnowledgeGraph } from "@/components/KnowledgeGraphCard";
import { SkillCenter, type CustomSkill } from "@/components/SkillCenter";
import { EvidenceInspector, type EvidenceCitation, type RetrievalInspectorData } from "@/components/EvidenceInspector";
import { createClientId } from "@/lib/client-id";
import { getSkill, type SkillId } from "@/lib/skills/registry";
import { recordToolHistory } from "@/lib/tool-history";
import { useProductLanguage } from "@/lib/product-language";
import {
  AGENT_SETTINGS_STORAGE_KEY,
  DEFAULT_AGENT_SETTINGS,
  normalizeAgentSettings,
  type AgentSettings,
} from "@/lib/agent-settings";

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

type Shortcut = { label: string; prompt: string; description: string };

const ACTIVE_CUSTOM_SKILL_COOKIE = "xjtlu_active_custom_skill";

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
  const [customSkill, setCustomSkill] = useState<CustomSkill | null>(null);
  const [sessionId] = useState(() => createClientId());
  const [busy, setBusy] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [fileStage, setFileStage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<PreviewField[]>([]);
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [instruction, setInstruction] = useState("");
  const fileRef = useRef<HTMLInputElement>(null);
  const chatInputRef = useRef<HTMLTextAreaElement>(null);
  const resultUrls = useRef<string[]>([]);

  const selectedWorkspace = workspaces.find((item) => item.slug === workspaceSlug);
  const account = selectedWorkspace?.label || "";
  const selectedSkill = getSkill(skillId);
  const activeSkillName = selectedSkill?.name || customSkill?.name || "";

  const shortcuts: Shortcut[] = lang === "en" ? [
    { label: "Find upcoming events", description: "See current campus activities", prompt: "Find upcoming or still-valid campus events in the current knowledge base. Organize them by event name, date/time, place, audience, registration method and source. Do not guess missing details." },
    { label: "Extract event details", description: "Pull out time, place and registration", prompt: "Extract the event name, date, time, place, audience, eligibility, registration method and contact details from the most relevant article. Do not guess missing fields." },
    { label: "Check validity", description: "Check whether information is still current", prompt: "Use publication date, event date and deadline to judge whether the information is still valid. Explain the evidence and uncertainty." },
    { label: "Summarize article", description: "Turn long content into clear points", prompt: "Create a structured summary from the most relevant article while preserving dates, names, numbers and the original source link." },
  ] : [
    { label: "查找近期活动", description: "查看当前仍可参加的校园活动", prompt: "请查找当前知识库中尚未过期的近期活动，并按活动名称、时间、地点、参与对象、报名方式和来源整理。缺失信息不要推测。" },
    { label: "提取活动信息", description: "提取时间、地点与报名信息", prompt: "请从最相关的文章中提取活动名称、日期、时间、地点、参与对象、资格、报名方式和联系方式。缺失信息不要推测。" },
    { label: "检查信息有效性", description: "判断通知或活动是否仍有效", prompt: "请根据发布日期、活动日期和截止日期判断相关信息是否仍然有效，并说明判断依据与不确定性。" },
    { label: "生成文章摘要", description: "把长文章整理成清晰要点", prompt: "请根据最相关的文章生成结构化摘要，并保留关键日期、名称、数字及原文链接。" },
  ];

  useEffect(() => {
    const focusChat = () => chatInputRef.current?.focus();
    window.addEventListener("xjtlu-focus-chat", focusChat);
    return () => window.removeEventListener("xjtlu-focus-chat", focusChat);
  }, []);

  useEffect(() => {
    setInstruction(lang === "en"
      ? "Fill the selected fields accurately from the knowledge base. If there is no explicit evidence, enter ‘Not explicitly stated in the document.’"
      : "请根据知识库准确填写已选择字段；没有明确证据时填写“文档未明确说明”。");
  }, [lang]);

  useEffect(() => {
    const readAgentSettings = () => {
      try {
        const parsed = JSON.parse(localStorage.getItem(AGENT_SETTINGS_STORAGE_KEY) || "null");
        setAgentSettings(normalizeAgentSettings(parsed));
      } catch {
        setAgentSettings(DEFAULT_AGENT_SETTINGS);
      }
    };
    readAgentSettings();
    const onChange = (event: Event) => setAgentSettings(normalizeAgentSettings((event as CustomEvent<AgentSettings>).detail));
    window.addEventListener("xjtlu-agent-settings-change", onChange);
    window.addEventListener("storage", readAgentSettings);
    return () => {
      window.removeEventListener("xjtlu-agent-settings-change", onChange);
      window.removeEventListener("storage", readAgentSettings);
    };
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
    setCustomSkill(null);
    document.cookie = `${ACTIVE_CUSTOM_SKILL_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  }

  async function sendText(value: string) {
    const input = value.trim();
    if (!input || busy || !account || !workspaceSlug) return;
    const skillName = selectedSkill?.name || customSkill?.name;
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
      setFileOpen(false);
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

  return <main className="chatPage">
    <section className="chatWorkspaceBar">
      <label><span>{t("知识库", "Knowledge base")}</span><select value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)}>{workspaces.length ? workspaces.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>) : <option value="">{t("未读取到知识库", "No knowledge base available")}</option>}</select></label>
      <span className={`chatConnection ${workspaceSlug ? "connected" : ""}`}><i />{workspaceSlug ? t("已连接", "Connected") : t("未配置", "Not configured")}</span>
      {workspaceWarning && <small title={workspaceWarning}>{t("同步信息可用", "Sync information available")}</small>}
    </section>

    {!messages.length && <section className="chatHero">
      <span>{t("可核查校园知识助手", "VERIFIABLE CAMPUS KNOWLEDGE")}</span>
      <h1>{t("你好，今天想了解什么校园信息？", "Hello, what campus information can I help you with?")}</h1>
      <p>{t("搜索官方校园知识、活动、通知和服务信息；缺少明确证据时不会推测。", "Search official campus knowledge, events, notices and services. Unsupported details are not guessed.")}</p>
      <div className="chatShortcutGrid">{shortcuts.map((item) => <button key={item.label} type="button" disabled={busy || !workspaceSlug} onClick={() => sendText(item.prompt)}><span className="chatShortcutIcon">✦</span><span><strong>{item.label}</strong><small>{item.description}</small></span></button>)}</div>
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
        </div>
      </article>)}
      {busy && <div className="chatProgress"><span className="spinner" /><div><strong>{fileStage || t("正在处理…", "Processing…")}</strong><small>{t("完成后会在当前对话中返回结果。", "The result will appear in this conversation when processing is complete.")}</small></div></div>}
    </section>

    <form className="chatComposer" onSubmit={send}>
      {activeSkillName && <div className="chatSelectedSkill">✦ {t("已选择", "Selected")}: {activeSkillName}<button type="button" onClick={clearActiveSkill}>×</button></div>}
      <textarea ref={chatInputRef} rows={3} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={selectedSkill?.kind === "graph" ? t("输入想生成关系图的主题…", "Enter a topic for the relationship graph…") : t("输入你想了解的校园信息…", "Ask about campus information…")} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey && !event.nativeEvent.isComposing) { event.preventDefault(); send(); } }} />
      <div className="chatComposerActions">
        <button type="button" onClick={() => setFileOpen(true)}>＋ {t("文件", "File")}</button>
        <label className={`chatAgentToggle ${agentMode ? "active" : ""}`} title={agentMode ? agentSettings.name : t("关闭时使用普通 AnythingLLM 问答链路", "When off, use the normal AnythingLLM chat path")}><input type="checkbox" checked={agentMode} onChange={(event) => setAgentMode(event.target.checked)} /> ✦ {t("Agent", "Agent")}{agentMode ? ` · ${agentSettings.name}` : ""}</label>
        <button type="button" className="chatSkillButton" onClick={() => window.dispatchEvent(new Event("xjtlu-open-skill-drawer"))}>✦ {t("Skills", "Skills")}</button>
        <button className="chatSendButton" disabled={busy || !message.trim() || !workspaceSlug}>{t("发送", "Send")}</button>
      </div>
    </form>

    <SkillCenter selected={skillId} selectedCustomId={customSkill?.id || ""} onSelect={setSkillId} onCustomSelect={setCustomSkill} onFileSkill={() => setFileOpen(true)} />

    {fileOpen && <div className="modal" role="dialog" aria-modal="true"><div className="filePanel">
      <button className="close" type="button" onClick={() => setFileOpen(false)} aria-label={t("关闭", "Close")}>×</button>
      <span className="panelEyebrow">FILE FILL</span>
      <h2>{t("上传模板 → 确认字段 → 智能填写", "Upload template → confirm fields → intelligent fill")}</h2>
      <p>{t("支持 Excel 与 Word 模板，最大 10 MB。生成后请人工复核。", "Supports Excel and Word templates up to 10 MB. Review the generated result before use.")}</p>
      <div className="filePicker"><button className="filePickerButton" type="button" onClick={() => fileRef.current?.click()}>{file ? t("更换文件", "Change file") : t("选择文件", "Choose file")}</button><span className={`filePickerName ${file ? "hasFile" : ""}`}>{file?.name || t("未选择文件", "No file selected")}</span><input ref={fileRef} hidden type="file" accept=".xlsx,.docx" onChange={(event) => { const next = event.target.files?.[0]; if (next) inspectFile(next); }} /></div>
      {fileStage && <div className="fileStage">{fileStage}</div>}
      {fields.length > 0 && <><div className="fieldToolbar"><strong>{t("识别到的字段", "Detected fields")}</strong><span>{t(`已选择 ${selectedFieldIds.length}/${fields.length}`, `Selected ${selectedFieldIds.length}/${fields.length}`)}</span><button type="button" onClick={() => setSelectedFieldIds(selectedFieldIds.length === fields.length ? [] : fields.map((item) => item.id))}>{selectedFieldIds.length === fields.length ? t("取消全选", "Clear all") : t("全选", "Select all")}</button></div><div className="fieldList">{fields.map((field) => <label key={field.id}><input type="checkbox" checked={selectedFieldIds.includes(field.id)} onChange={() => toggleField(field.id)} /><span><strong>{field.label}</strong><small>{field.kind === "xlsx" ? `${field.sheet} · ${field.address}` : t("Word 占位符", "Word placeholder")}</small></span></label>)}</div></>}
      <label className="instructionLabel"><span>{t("填写要求", "Fill instructions")}</span><textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} /></label>
      <button className="primary" type="button" disabled={!file || !selectedFieldIds.length || busy} onClick={fillFile}>{busy ? t("正在填写…", "Filling…") : t("确认字段并开始填写", "Confirm fields and fill")}</button>
      <small>{t("生成结果必须人工复核，尤其是日期、数字、邮箱、地点与原文链接。", "Generated results must be reviewed, especially dates, numbers, email addresses, locations and source links.")}</small>
    </div></div>}
  </main>;
}
