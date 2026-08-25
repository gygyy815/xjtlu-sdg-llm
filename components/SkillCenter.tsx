"use client";

import { useMemo, useRef, useState } from "react";
import { skillRegistry, type SkillId } from "@/lib/skills/registry";
import { translateUiText } from "@/lib/ui-i18n";
import { useProductLanguage } from "@/lib/product-language";

export type CustomSkill = {
  id: string;
  name: string;
  description: string;
  prompt: string;
  source: "created" | "imported";
};

type Props = {
  selected: SkillId | "";
  selectedCustomId?: string;
  onSelect: (id: SkillId | "") => void;
  onCustomSelect?: (skill: CustomSkill | null) => void;
  onFileSkill: () => void;
};

const STORAGE_KEY = "xjtlu-custom-skills-v1";
const ACTIVE_COOKIE = "xjtlu_active_custom_skill";
const COLLAPSE_KEY = "xjtlu-skill-rail-collapsed";

function readSkills(): CustomSkill[] {
  try {
    const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
    return Array.isArray(parsed)
      ? parsed.filter((item) => item?.id && item?.name && item?.prompt)
      : [];
  } catch {
    return [];
  }
}

export function SkillCenter({ selected, selectedCustomId = "", onSelect, onCustomSelect, onFileSkill }: Props) {
  const { lang, t } = useProductLanguage();
  const [collapsed, setCollapsed] = useState(() => {
    if (typeof window === "undefined") return true;
    return localStorage.getItem(COLLAPSE_KEY) !== "0";
  });
  const [tab, setTab] = useState<"official" | "mine" | "imported">("official");
  const [query, setQuery] = useState("");
  const [skills, setSkills] = useState<CustomSkill[]>(() => typeof window === "undefined" ? [] : readSkills());
  const [activeCustomId, setActiveCustomId] = useState(selectedCustomId);
  const [editorOpen, setEditorOpen] = useState(false);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const localize = (value: string) => lang === "en" ? translateUiText(value) : value;

  function persistSkills(next: CustomSkill[]) {
    setSkills(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("xjtlu-custom-skills-change", { detail: { count: next.length } }));
  }

  function setCollapsedValue(next: boolean) {
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  }

  function setActiveCookie(skill: CustomSkill | null) {
    if (!skill) {
      document.cookie = `${ACTIVE_COOKIE}=; Path=/; Max-Age=0; SameSite=Lax`;
      setActiveCustomId("");
      return;
    }
    const payload = encodeURIComponent(JSON.stringify({ id: skill.id, name: skill.name, prompt: skill.prompt.slice(0, 2600) }));
    document.cookie = `${ACTIVE_COOKIE}=${payload}; Path=/; Max-Age=86400; SameSite=Lax`;
    setActiveCustomId(skill.id);
  }

  function clearSelection() {
    onSelect("");
    setActiveCookie(null);
    onCustomSelect?.(null);
  }

  function chooseOfficial(id: SkillId) {
    setActiveCookie(null);
    onCustomSelect?.(null);
    if (id === "file-fill") {
      onSelect(id);
      onFileSkill();
      setCollapsedValue(true);
      return;
    }
    if (id === "mind-map") {
      window.location.href = "/tools/mind-map";
      return;
    }
    if (id === "ppt-maker") {
      window.location.href = "/tools/ppt";
      return;
    }
    onSelect(selected === id ? "" : id);
    setCollapsedValue(true);
  }

  function chooseCustom(skill: CustomSkill) {
    onSelect("");
    const next = activeCustomId === skill.id ? null : skill;
    setActiveCookie(next);
    onCustomSelect?.(next);
    setCollapsedValue(true);
  }

  function createSkill() {
    if (!name.trim() || !prompt.trim()) return;
    const skill: CustomSkill = {
      id: `custom-${Date.now()}`,
      name: name.trim(),
      description: description.trim() || t("自定义对话技能", "Custom conversation skill"),
      prompt: prompt.trim(),
      source: "created",
    };
    persistSkills([skill, ...skills]);
    setName("");
    setDescription("");
    setPrompt("");
    setEditorOpen(false);
    setTab("mine");
  }

  async function importSkill(file: File) {
    try {
      const parsed = JSON.parse(await file.text());
      const rows = (Array.isArray(parsed) ? parsed : [parsed]).filter((item) => item && typeof item.name === "string" && typeof item.prompt === "string");
      const imported: CustomSkill[] = rows.map((item, index) => ({
        id: `imported-${Date.now()}-${index}`,
        name: item.name.trim(),
        description: typeof item.description === "string" && item.description.trim()
          ? item.description.trim()
          : t("导入的自定义技能", "Imported custom skill"),
        prompt: item.prompt.trim(),
        source: "imported",
      }));
      if (imported.length) {
        persistSkills([...imported, ...skills]);
        setTab("imported");
      }
    } catch {
      window.alert(t("导入失败：请使用包含 name、prompt，可选 description 的 JSON 文件。", "Import failed: use a JSON file with name and prompt, plus optional description."));
    } finally {
      if (importRef.current) importRef.current.value = "";
    }
  }

  function deleteSkill(skill: CustomSkill) {
    if (!window.confirm(t(`确定删除“${skill.name}”吗？`, `Delete “${skill.name}”?`))) return;
    if (activeCustomId === skill.id) clearSelection();
    persistSkills(skills.filter((item) => item.id !== skill.id));
  }

  const officialShown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skillRegistry.filter((skill) => {
      if (!q) return true;
      const haystack = `${skill.name} ${skill.description} ${translateUiText(skill.name)} ${translateUiText(skill.description)}`.toLowerCase();
      return haystack.includes(q);
    });
  }, [query]);

  const customShown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skills.filter((skill) => {
      if (tab === "mine" && skill.source !== "created") return false;
      if (tab === "imported" && skill.source !== "imported") return false;
      return !q || `${skill.name} ${skill.description}`.toLowerCase().includes(q);
    });
  }, [skills, tab, query]);

  if (collapsed) {
    return <aside className="skillRail skillRailCollapsed" data-skill-drawer>
      <button type="button" className="skillDrawerOpen" onClick={() => setCollapsedValue(false)} aria-label={t("打开技能", "Open skills")}>
        <span>✦</span><b>{t("技能", "Skills")}</b>
      </button>
    </aside>;
  }

  return <>
    <div className="skillDrawerBackdrop" onClick={() => setCollapsedValue(true)} aria-hidden="true" />
    <aside className="skillRail" data-skill-drawer>
      <div className="skillDrawerHeader">
        <div><span>SKILLS</span><h2>{t("选择一个任务能力", "Choose a skill")}</h2></div>
        <button type="button" className="skillDrawerClose" onClick={() => setCollapsedValue(true)} aria-label={t("关闭技能", "Close skills")}>×</button>
      </div>
      <p className="skillHint">{t("选择后会回到当前对话，并使用当前 AnythingLLM 知识库执行。", "After selection, the skill runs in the current chat using the active AnythingLLM knowledge base.")}</p>

      <div className="skillSearch"><span>⌕</span><input value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("搜索技能", "Search skills")} /></div>
      <div className="skillCreateRow">
        <button type="button" className="skillPrimaryAction" onClick={() => setEditorOpen(true)}>＋ {t("创建技能", "Create skill")}</button>
        <button type="button" onClick={() => importRef.current?.click()}>⇧ {t("导入", "Import")}</button>
        <input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(event) => { const file = event.target.files?.[0]; if (file) importSkill(file); }} />
      </div>

      <div className="skillTabs">
        <button type="button" className={tab === "official" ? "active" : undefined} onClick={() => setTab("official")}>{t("内置", "Built-in")}</button>
        <button type="button" className={tab === "mine" ? "active" : undefined} onClick={() => setTab("mine")}>{t("我的", "Mine")}</button>
        <button type="button" className={tab === "imported" ? "active" : undefined} onClick={() => setTab("imported")}>{t("已导入", "Imported")}</button>
      </div>

      <div className="skillList">
        {tab === "official" ? officialShown.map((skill) => <button type="button" key={skill.id} className={`skillCard ${selected === skill.id ? "selected" : ""}`} onClick={() => chooseOfficial(skill.id)}>
          <span className="skillIcon">{skill.icon}</span>
          <span className="skillCopy"><strong>{localize(skill.name)}</strong><small>{localize(skill.description)}</small></span>
          <span className="skillArrow">→</span>
        </button>) : customShown.map((skill) => <div className="customSkillWrap" key={skill.id}>
          <button type="button" className={`skillCard ${activeCustomId === skill.id ? "selected" : ""}`} onClick={() => chooseCustom(skill)}>
            <span className="skillIcon">✦</span>
            <span className="skillCopy"><strong>{skill.name}</strong><small>{skill.description}</small></span>
            <span className="skillArrow">→</span>
          </button>
          <button type="button" className="skillDeleteButton" onClick={() => deleteSkill(skill)} aria-label={t("删除技能", "Delete skill")}>×</button>
        </div>)}
        {tab !== "official" && !customShown.length && <div className="skillEmpty">{t("这里还没有技能。", "No skills here yet.")}</div>}
      </div>

      <button type="button" className="skillClearSelection" onClick={clearSelection}>{t("清除当前技能", "Clear current skill")}</button>
    </aside>

    {editorOpen && <div className="skillEditorBackdrop">
      <section className="skillEditor" role="dialog" aria-modal="true">
        <button type="button" className="skillEditorClose" onClick={() => setEditorOpen(false)}>×</button>
        <span>CREATE SKILL</span><h3>{t("创建自定义技能", "Create custom skill")}</h3>
        <label>{t("技能名称", "Skill name")}<input value={name} onChange={(event) => setName(event.target.value)} /></label>
        <label>{t("技能说明", "Description")}<input value={description} onChange={(event) => setDescription(event.target.value)} /></label>
        <label>{t("执行指令", "Instructions")}<textarea value={prompt} onChange={(event) => setPrompt(event.target.value)} /></label>
        <button type="button" className="primary" disabled={!name.trim() || !prompt.trim()} onClick={createSkill}>{t("创建技能", "Create skill")}</button>
      </section>
    </div>}
  </>;
}
