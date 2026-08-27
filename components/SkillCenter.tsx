"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { skillRegistry, type SkillDefinition, type SkillId } from "@/lib/skills/registry";
import { translateUiText } from "@/lib/ui-i18n";
import { useProductLanguage } from "@/lib/product-language";

type Props = { selected: SkillId | ""; onSelect: (id: SkillId | "") => void };
const COLLAPSE_KEY = "xjtlu-skill-rail-collapsed";
const VISUAL_SKILLS = new Set<SkillId>(["knowledge-graph", "ppt-maker", "mind-map"]);

export function SkillCenter({ selected, onSelect }: Props) {
  const { lang, t } = useProductLanguage();
  const [collapsed, setCollapsed] = useState(() => typeof window === "undefined" || localStorage.getItem(COLLAPSE_KEY) !== "0");
  const [query, setQuery] = useState("");
  const searchRef = useRef<HTMLInputElement>(null);
  const localize = (value: string) => lang === "en" ? translateUiText(value) : value;

  function setCollapsedValue(next: boolean) {
    setCollapsed(next);
    localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0");
  }

  useEffect(() => {
    const openDrawer = () => {
      setCollapsedValue(false);
      requestAnimationFrame(() => searchRef.current?.focus());
    };
    window.addEventListener("xjtlu-open-skill-drawer", openDrawer);
    return () => window.removeEventListener("xjtlu-open-skill-drawer", openDrawer);
  }, []);

  useEffect(() => {
    if (collapsed) return;
    const close = (event: KeyboardEvent) => { if (event.key === "Escape") setCollapsedValue(true); };
    window.addEventListener("keydown", close);
    return () => window.removeEventListener("keydown", close);
  }, [collapsed]);

  const shown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skillRegistry.filter((skill) => !q || `${skill.name} ${skill.description} ${translateUiText(skill.name)} ${translateUiText(skill.description)}`.toLowerCase().includes(q));
  }, [query]);
  const common = shown.filter((skill) => !VISUAL_SKILLS.has(skill.id));
  const visual = shown.filter((skill) => VISUAL_SKILLS.has(skill.id));

  function choose(id: SkillId) {
    if (id === "mind-map") return window.location.assign("/tools/mind-map");
    if (id === "ppt-maker") return window.location.assign("/tools/ppt");
    onSelect(selected === id ? "" : id);
    setCollapsedValue(true);
  }

  function card(skill: SkillDefinition) {
    return <button type="button" key={skill.id} className={`skillCard ${selected === skill.id ? "selected" : ""}`} onClick={() => choose(skill.id)}>
      <span className="skillIcon">{skill.icon}</span><span className="skillCopy"><strong>{localize(skill.name)}</strong><small>{localize(skill.description)}</small></span><span className="skillArrow" aria-hidden="true">→</span>
    </button>;
  }

  if (collapsed) return null;
  return <>
    <div className="skillDrawerBackdrop" onClick={() => setCollapsedValue(true)} aria-hidden="true" />
    <aside className="skillRail" role="dialog" aria-modal="true" aria-labelledby="skill-title" data-skill-drawer>
      <div className="skillDrawerHeader"><div><span>SKILLS</span><h2 id="skill-title">{t("选择一个任务能力", "Choose a skill")}</h2></div><button type="button" className="skillDrawerClose" onClick={() => setCollapsedValue(true)} aria-label={t("关闭技能", "Close skills")}>×</button></div>
      <p className="skillHint">{t("从校园知识库执行常用任务，选择后会返回当前对话。", "Run a focused task with the campus knowledge base, then return to this chat.")}</p>
      <label className="skillSearch"><span aria-hidden="true">⌕</span><input ref={searchRef} value={query} onChange={(event) => setQuery(event.target.value)} placeholder={t("搜索技能", "Search skills")} aria-label={t("搜索技能", "Search skills")} /></label>
      <div className="skillList">
        {common.length > 0 && <section className="skillGroup"><h3 className="skillGroupTitle">{t("常用", "Common")}</h3>{common.map(card)}</section>}
        {visual.length > 0 && <section className="skillGroup"><h3 className="skillGroupTitle">{t("可视化与生成", "Visualize and create")}</h3>{visual.map(card)}</section>}
        {!shown.length && <div className="skillEmpty">{t("没有匹配的技能。", "No matching skills.")}</div>}
      </div>
      {selected && <button type="button" className="skillClearSelection" onClick={() => onSelect("")}>{t("清除当前技能", "Clear current skill")}</button>}
    </aside>
  </>;
}
