"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { skillRegistry, type SkillId } from "@/lib/skills/registry";

export type CustomSkill = { id: string; name: string; description: string; prompt: string; source: "created" | "imported" };

type Props = {
  selected: SkillId | "";
  selectedCustomId?: string;
  onSelect: (id: SkillId | "") => void;
  onCustomSelect?: (skill: CustomSkill | null) => void;
  onFileSkill: () => void;
};

const STORAGE_KEY = "xjtlu-custom-skills-v1";

export function SkillCenter({ selected, selectedCustomId = "", onSelect, onCustomSelect, onFileSkill }: Props) {
  const [tab, setTab] = useState<"official" | "mine" | "imported">("official");
  const [query, setQuery] = useState("");
  const [skills, setSkills] = useState<CustomSkill[]>([]);
  const [editorOpen, setEditorOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(parsed)) setSkills(parsed.filter((item) => item?.id && item?.name && item?.prompt));
    } catch {}
  }, []);

  function save(next: CustomSkill[]) {
    setSkills(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  }

  function choose(id: SkillId) {
    onCustomSelect?.(null);
    if (id === "file-fill") { onSelect(id); onFileSkill(); return; }
    onSelect(selected === id ? "" : id);
  }

  function chooseCustom(skill: CustomSkill) {
    onSelect("");
    onCustomSelect?.(selectedCustomId === skill.id ? null : skill);
  }

  function createSkill() {
    if (!name.trim() || !prompt.trim()) return;
    const next: CustomSkill = { id: `custom-${Date.now()}`, name: name.trim(), description: description.trim() || "自定义对话技能", prompt: prompt.trim(), source: "created" };
    save([next, ...skills]);
    setName(""); setDescription(""); setPrompt(""); setEditorOpen(false); setTab("mine");
  }

  async function importSkill(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      const items = (Array.isArray(parsed) ? parsed : [parsed]).filter((item) => item && typeof item.name === "string" && typeof item.prompt === "string");
      const imported: CustomSkill[] = items.map((item, index) => ({ id: `imported-${Date.now()}-${index}`, name: item.name.trim(), description: typeof item.description === "string" ? item.description.trim() : "导入的自定义技能", prompt: item.prompt.trim(), source: "imported" }));
      if (imported.length) { save([...imported, ...skills]); setTab("imported"); }
    } catch { window.alert("导入失败：请使用包含 name、prompt，可选 description 的 JSON 文件。"); }
    finally { if (importRef.current) importRef.current.value = ""; }
  }

  const officialShown = useMemo(() => { const q = query.trim().toLowerCase(); return skillRegistry.filter((s) => !q || `${s.name} ${s.description}`.toLowerCase().includes(q)); }, [query]);
  const customShown = useMemo(() => { const q = query.trim().toLowerCase(); return skills.filter((s) => (tab === "mine" ? s.source === "created" : s.source === "imported") && (!q || `${s.name} ${s.description}`.toLowerCase().includes(q))); }, [skills, tab, query]);

  return <aside className="skillRail">
    <div className="skillRailHeader"><div><span>SKILL CENTER</span><h2>技能中心</h2></div><button type="button" onClick={() => { onSelect(""); onCustomSelect?.(null); }}>清除</button></div>
    <p className="skillHint">选择一个技能后，它会作为当前对话的执行方式。可创建或导入自定义技能。</p>
    <div className="skillSearch">⌕ <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder="搜索技能" /></div>
    <div className="skillCreateRow"><button type="button" className="skillPrimaryAction" onClick={() => setEditorOpen(true)}>＋ 创建新技能</button><button type="button" onClick={() => importRef.current?.click()}>⇧ 导入技能</button><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) importSkill(file); }} /></div>
    <div className="skillTabs"><button className={tab === "official" ? "active" : ""} onClick={() => setTab("official")}>官方技能 ({skillRegistry.length})</button><button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>我的技能 ({skills.filter((s) => s.source === "created").length})</button><button className={tab === "imported" ? "active" : ""} onClick={() => setTab("imported")}>已导入 ({skills.filter((s) => s.source === "imported").length})</button></div>
    <div className="skillList">{tab === "official" ? officialShown.map((skill) => <button type="button" key={skill.id} className={`skillCard ${selected === skill.id ? "selected" : ""}`} onClick={() => choose(skill.id)}><span className={`skillIcon ${skill.id}`}>{skill.icon}</span><span className="skillCopy"><strong>{skill.name}</strong><small>{skill.description}</small></span><span className="builtin">内置</span></button>) : customShown.map((skill) => <button type="button" key={skill.id} className={`skillCard ${selectedCustomId === skill.id ? "selected" : ""}`} onClick={() => chooseCustom(skill)}><span className="skillIcon custom">✦</span><span className="skillCopy"><strong>{skill.name}</strong><small>{skill.description}</small></span><span className="builtin">{skill.source === "imported" ? "导入" : "自建"}</span></button>)}{tab !== "official" && !customShown.length && <div className="skillEmpty">还没有技能。可点击上方“创建新技能”或“导入技能”。</div>}</div>
    {editorOpen && <div className="skillModalBackdrop"><div className="skillEditor"><button type="button" className="close" onClick={() => setEditorOpen(false)}>×</button><span>CREATE SKILL</span><h3>创建自定义技能</h3><label>技能名称<input value={name} onChange={(e) => setName(e.target.value)} placeholder="例如：会议纪要整理" /></label><label>技能说明<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder="简短说明用途" /></label><label>执行指令<textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder="写清楚模型执行该技能时必须遵循的规则…" /></label><button type="button" className="primary" disabled={!name.trim() || !prompt.trim()} onClick={createSkill}>创建技能</button><small>当前 Demo 自定义技能保存在浏览器本地，并通过现有 AnythingLLM Workspace 执行，不会修改 AnythingLLM 内置技能。</small></div></div>}
  </aside>;
}
