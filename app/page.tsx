"use client";

import Link from "next/link";
import { FormEvent, useEffect, useRef, useState } from "react";
import { MarkdownMessage } from "@/components/MarkdownMessage";
import { KnowledgeGraphCard, type KnowledgeGraph } from "@/components/KnowledgeGraphCard";
import { SkillCenter, type CustomSkill } from "@/components/SkillCenter";
import { EvidenceInspector, type EvidenceCitation, type RetrievalInspectorData } from "@/components/EvidenceInspector";
import { createClientId } from "@/lib/client-id";
import { getSkill, type SkillId } from "@/lib/skills/registry";
import { recordToolHistory } from "@/lib/tool-history";
import { translateUiText, type UiLang } from "@/lib/ui-i18n";

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

const shortcuts = [
  { label: "查找近期活动", prompt: "请查找当前知识库中尚未过期的近期活动，并按活动名称、时间、地点、参与对象、报名方式和来源整理。" },
  { label: "提取活动信息", prompt: "请从最相关的文章中提取活动名称、日期、时间、地点、参与对象、报名方式和联系方式。缺失信息不要推测。" },
  { label: "检查信息有效性", prompt: "请根据发布日期、活动日期和截止日期判断相关信息是否仍然有效，并说明判断依据。" },
  { label: "生成文章摘要", prompt: "请生成结构化摘要，并保留关键日期、名称、数字及原文链接。" },
];

const FILE_INSTRUCTIONS: Record<UiLang, string> = {
  zh: "请根据知识库准确填写已选择字段；没有明确证据时填写“文档未明确说明”。",
  en: "Fill the selected fields accurately from the knowledge base; when there is no explicit evidence, enter “Not explicitly stated in the document.”",
};

const ACTIVE_CUSTOM_SKILL_COOKIE = "xjtlu_active_custom_skill";

export default function Home() {
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [workspaceWarning, setWorkspaceWarning] = useState("");
  const [message, setMessage] = useState("");
  const [messages, setMessages] = useState<Message[]>([]);
  const [agentMode, setAgentMode] = useState(false);
  const [skillId, setSkillId] = useState<SkillId | "">("");
  const [customSkill, setCustomSkill] = useState<CustomSkill | null>(null);
  const [sessionId] = useState(() => createClientId());
  const [busy, setBusy] = useState(false);
  const [fileOpen, setFileOpen] = useState(false);
  const [fileStage, setFileStage] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [fields, setFields] = useState<PreviewField[]>([]);
  const [selectedFieldIds, setSelectedFieldIds] = useState<string[]>([]);
  const [uiLang, setUiLang] = useState<UiLang>("zh");
  const [instruction, setInstruction] = useState(FILE_INSTRUCTIONS.zh);
  const [chatCount, setChatCount] = useState(0);
  const [fileCount, setFileCount] = useState(0);
  const fileRef = useRef<HTMLInputElement>(null);
  const resultUrls = useRef<string[]>([]);

  const selectedWorkspace = workspaces.find((item) => item.slug === workspaceSlug);
  const account = selectedWorkspace?.label || "";
  const localizedSkillName = (name?: string) => name ? (uiLang === "en" ? translateUiText(name) : name) : "";
  const activeSkillName = getSkill(skillId)?.name || customSkill?.name || "";

  function clearActiveSkill() {
    setSkillId("");
    setCustomSkill(null);
    document.cookie = `${ACTIVE_CUSTOM_SKILL_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
  }

  useEffect(() => {
    const applyUiLanguage = (next: UiLang) => {
      setUiLang(next);
      setInstruction((current) => {
        if (current === FILE_INSTRUCTIONS.zh || current === FILE_INSTRUCTIONS.en) return FILE_INSTRUCTIONS[next];
        return current;
      });
    };

    applyUiLanguage(localStorage.getItem("xjtlu-ui-language") === "en" ? "en" : "zh");
    const onLanguageChange = (event: Event) => {
      const next = (event as CustomEvent<{ lang?: UiLang }>).detail?.lang === "en" ? "en" : "zh";
      applyUiLanguage(next);
    };
    window.addEventListener("xjtlu-ui-language-change", onLanguageChange);
    return () => window.removeEventListener("xjtlu-ui-language-change", onLanguageChange);
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
        setWorkspaceWarning(data.warning || (data.staleConfigured?.length ? `已自动隐藏 ${data.staleConfigured.length} 个恢复后已不存在的旧 Workspace 配置。` : ""));
      })
      .catch(() => setWorkspaceWarning("无法读取当前 AnythingLLM Workspace。"));
    return () => resultUrls.current.forEach(URL.revokeObjectURL);
  }, []);

  async function sendText(value: string) {
    const input = value.trim();
    if (!input || busy || !account || !workspaceSlug) return;
    const selectedSkill = getSkill(skillId);
    const selectedSkillName = selectedSkill?.name || customSkill?.name;
    setMessages((old) => [...old, { role: "user", text: input, workspace: account, skill: selectedSkillName }]);
    setMessage("");
    setBusy(true);
    setChatCount((count) => count + 1);

    try {
      if (selectedSkill?.kind === "graph") {
        const response = await fetch("/api/skills/knowledge-graph", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: input, account, workspaceSlug, sessionId }),
        });
        const data = await response.json();
        if (!response.ok) throw new Error(data.error || (uiLang === "en" ? "Knowledge Graph generation failed." : "知识图谱生成失败。"));
        setMessages((old) => [...old, {
          role: "assistant",
          text: data.graph?.summary || (uiLang === "en" ? "A relationship graph was generated from the retrieved evidence." : "已根据检索内容生成关系图。"),
          graph: data.graph,
          citations: data.citations,
          workspace: account,
          skill: selectedSkillName,
        }]);
        return;
      }

      const response = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: input, account, workspaceSlug, agentMode, sessionId, skillId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || (uiLang === "en" ? "Request failed." : "请求失败。"));
      setMessages((old) => [...old, {
        role: "assistant",
        text: data.text || (uiLang === "en" ? "No content was returned." : "未返回内容。"),
        citations: data.citations,
        retrieval: data.retrieval,
        workspace: account,
        skill: data.activeSkill || selectedSkillName,
      }]);
    } catch (error) {
      setMessages((old) => [...old, { role: "assistant", text: error instanceof Error ? error.message : (uiLang === "en" ? "The knowledge base is temporarily unavailable." : "暂时无法连接知识库。") }]);
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
    setFileStage(uiLang === "en" ? "Detecting template fields…" : "正在识别模板字段…");
    const form = new FormData();
    form.append("file", sourceFile);
    try {
      const response = await fetch("/api/fill-file/inspect", { method: "POST", body: form });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || (uiLang === "en" ? "Template detection failed." : "模板识别失败。"));
      const detected = (data.fields || []) as PreviewField[];
      setFields(detected);
      setSelectedFieldIds(detected.map((item) => item.id));
      setFileStage(uiLang === "en" ? `Detected ${detected.length} fields. Confirm them before filling.` : `已识别 ${detected.length} 个字段，请确认后再填写。`);
    } catch (error) {
      setFileStage(error instanceof Error ? error.message : (uiLang === "en" ? "Template detection failed." : "模板识别失败。"));
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
    setFileStage(uiLang === "en" ? `Searching “${account}” and filling ${selectedFieldIds.length} fields…` : `正在检索“${account}”并填写 ${selectedFieldIds.length} 个字段…`);
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
        throw new Error(data.error || (uiLang === "en" ? "File processing failed." : "文件处理失败。"));
      }
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      resultUrls.current.push(url);
      const kind = sourceFile.name.toLowerCase().endsWith(".xlsx") ? "xlsx" : "docx";
      const outputName = `filled-${sourceFile.name}`;
      const preview = kind === "xlsx" ? await previewXlsx(blob) : {};
      setMessages((old) => [...old,
        { role: "user", text: instruction, attachment: sourceFile.name, workspace: account, skill: uiLang === "en" ? "File Fill" : "文件填写" },
        { role: "assistant", text: uiLang === "en" ? `Generated the file using the ${selectedFieldIds.length} fields you confirmed. Review the preview and source facts before downloading.` : `已按你确认的 ${selectedFieldIds.length} 个字段生成文件。请先核对预览与来源事实，再下载使用。`, fileResult: { name: outputName, url, kind, ...preview }, workspace: account, skill: uiLang === "en" ? "File Fill" : "文件填写" },
      ]);
      recordToolHistory({
        sessionId,
        workspace: account,
        workspaceSlug,
        tool: "file-fill",
        inputName: sourceFile.name,
        outputName,
        fieldCount: selectedFieldIds.length,
        instruction,
      });
      setFileCount((count) => count + 1);
      setFile(null);
      setFields([]);
      setSelectedFieldIds([]);
      setFileOpen(false);
      setFileStage("");
      if (fileRef.current) fileRef.current.value = "";
    } catch (error) {
      setFileStage(error instanceof Error ? error.message : (uiLang === "en" ? "File processing failed." : "文件处理失败。"));
    } finally {
      setBusy(false);
    }
  }

  function toggleField(id: string) {
    setSelectedFieldIds((current) => current.includes(id) ? current.filter((item) => item !== id) : [...current, id]);
  }

  return (
    <main className="dashboardShell">
      <aside className="leftRail">
        <div className="brandBlock"><span className="brandMark">XJ</span><div><strong>XJTLU Campus</strong><small>Information Assistant</small></div></div>
        <nav className="sideNav">
          <button type="button" className="active" onClick={() => { setMessages([]); setMessage(""); }}>＋ 新建对话</button>
          <Link href="/history">◷ 对话历史</Link>
          <Link href="/articles">▤ 浏览知识</Link>
          <Link href="/knowledge-base">▣ 知识库管理</Link>
          <Link href="/dashboard">▥ 数据看板</Link>
          <Link href="/feedback">◇ 反馈与建议</Link>
          <Link href="/settings">⚙ 设置</Link>
        </nav>
        <section className="sessionOverview">
          <h3>本次会话概览</h3>
          <div><span>对话请求</span><strong>{chatCount}</strong></div>
          <div><span>文件处理</span><strong>{fileCount}</strong></div>
          <small>Token 用量将在接入模型 usage 统计后显示，当前不估算。</small>
        </section>
      </aside>

      <section className="centerStage">
        <header className="dashboardHeader">
          <label><span>知识库</span><select value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)}>{workspaces.length ? workspaces.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>) : <option value="">未读取到 Workspace</option>}</select></label>
          <div className="kbStatus"><i />知识库状态：<strong>{workspaceSlug ? "已连接" : "未配置"}</strong></div>
          {workspaceWarning && <span className="workspaceSyncNote" title={workspaceWarning}>已与当前 AnythingLLM 同步</span>}
          <Link href="/articles">浏览文章 →</Link>
        </header>

        <section className="welcomeStrip">
          <span>可核查校园知识助手</span>
          <h1>检索文章、提取活动信息、生成关系图并填写文件</h1>
          <p>所有知识类回答基于当前 AnythingLLM 中实际存在的 Workspace；缺少明确证据时不推测。</p>
          <div className="shortcutRow">{shortcuts.map((item) => <button key={item.label} disabled={busy || !workspaceSlug} onClick={() => sendText(item.prompt)}>{item.label}</button>)}</div>
        </section>

        <section className="conversation" aria-live="polite">
          {!messages.length && <div className="emptyState"><span>✦</span><strong>选择右侧技能，然后输入你的问题。</strong><p>知识图谱会抽取活动、部门、受众、地点与时间；文件填写会先识别字段再让你确认。</p></div>}
          {messages.map((item, index) => (
            <article key={index} className={`message ${item.role}`}>
              <div className="avatar">{item.role === "user" ? "你" : "AI"}</div>
              <div className="messageBody">
                {(item.workspace || item.skill) && <div className="messageMeta">{item.workspace && <span>{item.workspace}</span>}{item.skill && <span>{uiLang === "en" ? "Skill: " : "技能："}{localizedSkillName(item.skill)}</span>}</div>}
                {item.role === "assistant" ? <MarkdownMessage text={item.text} /> : <p>{item.text}</p>}
                {item.attachment && <div className="attachmentChip">▦ <strong>{item.attachment}</strong></div>}
                {item.graph && <KnowledgeGraphCard graph={item.graph} citations={item.citations} />}
                {item.fileResult && <div className="fileCard">
                  <div className="fileCardHead"><span>{item.fileResult.kind.toUpperCase()}</span><div><strong>{item.fileResult.name}</strong><small>已生成 · 待人工复核</small></div></div>
                  {item.fileResult.rows?.length ? <div className="sheetPreview">{item.fileResult.rows.map((row, i) => <div key={i}><span>{row.field}</span><strong>{row.value}</strong></div>)}</div> : <p>Word 文件已生成，请下载后检查表格、分页与长文本换行。</p>}
                  <a href={item.fileResult.url} download={item.fileResult.name}>下载生成文件</a>
                </div>}
                {!item.graph && item.role === "assistant" && <EvidenceInspector citations={item.citations} retrieval={item.retrieval} lang={uiLang} />}
              </div>
            </article>
          ))}
          {busy && <div className="progressCard"><span className="spinner" /><div><strong>{fileStage || (uiLang === "en" ? "Processing…" : "正在处理…")}</strong><small>完成后会在当前对话中返回结果。</small></div></div>}
        </section>

        <form className="composer" onSubmit={send}>
          {activeSkillName && <div className="selectedSkillChip">{uiLang === "en" ? "Selected: " : "已选择："}{customSkill?.name || localizedSkillName(activeSkillName)}<button type="button" onClick={clearActiveSkill}>×</button></div>}
          <textarea rows={3} value={message} onChange={(event) => setMessage(event.target.value)} placeholder={skillId === "knowledge-graph" ? "输入想生成关系图的主题，例如：近期校园活动与相关部门…" : customSkill ? (uiLang === "en" ? `Ask using “${customSkill.name}”…` : `使用“${customSkill.name}”输入你的问题…`) : "输入你想了解的校园信息…"} onKeyDown={(event) => { if (event.key === "Enter" && !event.shiftKey) { event.preventDefault(); send(); } }} />
          <div className="composerActions">
            <button type="button" onClick={() => setFileOpen(true)}>＋ 文件</button>
            <label className="agentToggle"><input type="checkbox" checked={agentMode} onChange={(event) => setAgentMode(event.target.checked)} /> Agent 模式</label>
            <small className="composerResizeHint">拖动输入框右下角可调整高度</small>
            <button className="sendButton" disabled={busy || !message.trim() || !workspaceSlug}>发送</button>
          </div>
        </form>
      </section>

      <SkillCenter
        selected={skillId}
        selectedCustomId={customSkill?.id || ""}
        onSelect={setSkillId}
        onCustomSelect={setCustomSkill}
        onFileSkill={() => setFileOpen(true)}
      />

      {fileOpen && <div className="modal" role="dialog" aria-modal="true"><div className="filePanel">
        <button className="close" type="button" onClick={() => setFileOpen(false)} aria-label={uiLang === "en" ? "Close file fill" : "关闭文件填写"}>×</button>
        <span className="panelEyebrow">FILE FILL</span>
        <h2>{uiLang === "en" ? "Upload template → confirm fields → intelligent fill" : "上传模板 → 确认字段 → 智能填写"}</h2>
        <p>{uiLang === "en" ? <>Excel: detect left-side labels and adjacent blank cells; Word: detect <code>{"{{field_name}}"}</code> placeholders. Maximum 10 MB.</> : <>Excel：识别左侧标签与右侧空白单元格；Word：识别 <code>{"{{字段名}}"}</code> 占位符。最大 10 MB。</>}</p>
        <div className="filePicker">
          <button className="filePickerButton" type="button" onClick={() => fileRef.current?.click()}>{uiLang === "en" ? (file ? "Change file" : "Choose file") : (file ? "更换文件" : "选择文件")}</button>
          <span className={`filePickerName ${file ? "hasFile" : ""}`}>{file?.name || (uiLang === "en" ? "No file selected" : "未选择文件")}</span>
          <input ref={fileRef} hidden type="file" accept=".xlsx,.docx" onChange={(event) => { const next = event.target.files?.[0]; if (next) inspectFile(next); }} />
        </div>
        {fileStage && <div className="fileStage">{fileStage}</div>}
        {fields.length > 0 && <>
          <div className="fieldToolbar"><strong>{uiLang === "en" ? "Detected fields" : "识别到的字段"}</strong><span>{uiLang === "en" ? `Selected ${selectedFieldIds.length}/${fields.length}` : `已选择 ${selectedFieldIds.length}/${fields.length}`}</span><button type="button" onClick={() => setSelectedFieldIds(selectedFieldIds.length === fields.length ? [] : fields.map((item) => item.id))}>{selectedFieldIds.length === fields.length ? (uiLang === "en" ? "Clear all" : "取消全选") : (uiLang === "en" ? "Select all" : "全选")}</button></div>
          <div className="fieldList">{fields.map((field) => <label key={field.id}><input type="checkbox" checked={selectedFieldIds.includes(field.id)} onChange={() => toggleField(field.id)} /><span><strong>{field.label}</strong><small>{field.kind === "xlsx" ? `${field.sheet} · ${field.address}` : (uiLang === "en" ? "Word placeholder" : "Word 占位符")}</small></span></label>)}</div>
        </>}
        <label className="instructionLabel"><span>{uiLang === "en" ? "Fill instructions" : "填写要求"}</span><textarea value={instruction} onChange={(event) => setInstruction(event.target.value)} /></label>
        <button className="primary" type="button" disabled={!file || !selectedFieldIds.length || busy} onClick={fillFile}>{busy ? (uiLang === "en" ? "Filling…" : "正在填写…") : (uiLang === "en" ? "Confirm fields and start filling" : "确认字段并开始填写")}</button>
        <small>{uiLang === "en" ? "Generated results must be reviewed by a person, especially dates, numbers, email addresses, locations and original links." : "生成结果必须人工复核，尤其是日期、数字、邮箱、地点与原文链接。"}</small>
      </div></div>}
    </main>
  );
}
