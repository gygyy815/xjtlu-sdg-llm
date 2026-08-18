"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { skillRegistry, type SkillId } from "@/lib/skills/registry";
import { translateUiText, type UiLang } from "@/lib/ui-i18n";

export type CustomSkill = { id: string; name: string; description: string; prompt: string; source: "created" | "imported" };

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
const UI_LANGUAGE_KEY = "xjtlu-ui-language";

export function SkillCenter({ selected, selectedCustomId = "", onSelect, onCustomSelect, onFileSkill }: Props) {
  const [tab, setTab] = useState<"official" | "mine" | "imported">("official");
  const [query, setQuery] = useState("");
  const [skills, setSkills] = useState<CustomSkill[]>([]);
  const [activeCustomId, setActiveCustomId] = useState(selectedCustomId);
  const [editorOpen, setEditorOpen] = useState(false);
  const [collapsed, setCollapsed] = useState(false);
  const [uiLang, setUiLang] = useState<UiLang>("zh");
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [prompt, setPrompt] = useState("");
  const importRef = useRef<HTMLInputElement>(null);

  const t = (value: string) => uiLang === "en" ? translateUiText(value) : value;

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(STORAGE_KEY) || "[]");
      if (Array.isArray(parsed)) setSkills(parsed.filter((item) => item?.id && item?.name && item?.prompt));
      setCollapsed(localStorage.getItem(COLLAPSE_KEY) === "1");
      setUiLang(localStorage.getItem(UI_LANGUAGE_KEY) === "en" ? "en" : "zh");
    } catch {}

    const onLanguage = (event: Event) => {
      const next = (event as CustomEvent<{ lang?: UiLang }>).detail?.lang;
      if (next === "zh" || next === "en") setUiLang(next);
    };
    window.addEventListener("xjtlu-ui-language-change", onLanguage);
    return () => window.removeEventListener("xjtlu-ui-language-change", onLanguage);
  }, []);

  function toggleCollapsed() {
    setCollapsed((current) => {
      const next = !current;
      try { localStorage.setItem(COLLAPSE_KEY, next ? "1" : "0"); } catch {}
      return next;
    });
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

  function save(next: CustomSkill[]) {
    setSkills(next);
    localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    window.dispatchEvent(new CustomEvent("xjtlu-custom-skills-change", { detail: { count: next.length } }));
  }

  function choose(id: SkillId) {
    setActiveCookie(null);
    onCustomSelect?.(null);
    if (id === "file-fill") { onSelect(id); onFileSkill(); return; }
    if (id === "mind-map") { window.location.href = "/tools/mind-map"; return; }
    if (id === "ppt-maker") { window.location.href = "/tools/ppt"; return; }
    onSelect(selected === id ? "" : id);
  }

  function chooseCustom(skill: CustomSkill) {
    onSelect("");
    const next = activeCustomId === skill.id ? null : skill;
    setActiveCookie(next);
    onCustomSelect?.(next);
  }

  function clearAll() {
    onSelect("");
    setActiveCookie(null);
    onCustomSelect?.(null);
  }

  function deleteCustomSkill(skill: CustomSkill) {
    const confirmed = window.confirm(
      uiLang === "en"
        ? `Delete “${skill.name}”? This only removes the skill saved in this browser.`
        : `确定删除“${skill.name}”吗？这只会删除当前浏览器中保存的该技能。`,
    );
    if (!confirmed) return;

    if (activeCustomId === skill.id) {
      onSelect("");
      setActiveCookie(null);
      onCustomSelect?.(null);
    }

    save(skills.filter((item) => item.id !== skill.id));
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
    } catch { window.alert(t("导入失败：请使用包含 name、prompt，可选 description 的 JSON 文件。")); }
    finally { if (importRef.current) importRef.current.value = ""; }
  }

  const officialShown = useMemo(() => {
    const q = query.trim().toLowerCase();
    return skillRegistry.filter((skill) => {
      if (!q) return true;
      const searchText = `${skill.name} ${skill.description} ${translateUiText(skill.name)} ${translateUiText(skill.description)}`.toLowerCase();
      return searchText.includes(q);
    });
  }, [query]);
  const customShown = useMemo(() => { const q = query.trim().toLowerCase(); return skills.filter((s) => (tab === "mine" ? s.source === "created" : s.source === "imported") && (!q || `${s.name} ${s.description}`.toLowerCase().includes(q))); }, [skills, tab, query]);
  const activeName = selected ? skillRegistry.find((item) => item.id === selected)?.name : skills.find((item) => item.id === activeCustomId)?.name;
  const activeDisplayName = activeName && selected ? t(activeName) : activeName;
  const createdCount = skills.filter((skill) => skill.source === "created").length;
  const importedCount = skills.filter((skill) => skill.source === "imported").length;

  return <>
    <aside className={`skillRail ${collapsed ? "skillRailCollapsed" : ""}`} data-no-ui-translate>
      {collapsed ? <div className="skillRailMini">
        <button type="button" className="skillMiniExpand" onClick={toggleCollapsed} title={t("展开技能中心")} aria-label={t("展开技能中心")}>
          <b>‹</b><span>{t("技能")}</span>{activeDisplayName && <i title={`${t("已选择：")}${activeDisplayName}`} />}
        </button>
      </div> : <>
        <button type="button" className="skillEdgeCollapse" onClick={toggleCollapsed} title={t("收起技能中心")} aria-label={t("收起技能中心")}><b>›</b><span>{t("收起")}</span></button>
        <div className="skillRailHeader">
          <div><span>SKILL CENTER</span><h2>{t("技能中心")}</h2></div>
          <button type="button" className="skillClearButton" onClick={clearAll}>{t("清除")}</button>
        </div>
        <p className="skillHint">{t("选择一个技能后，它会作为当前对话的执行方式。PPT 制作与思维导图会进入专用可视化工具页。")}</p>
        <div className="skillSearch">⌕ <input value={query} onChange={(e) => setQuery(e.target.value)} placeholder={t("搜索技能")} /></div>
        <div className="skillCreateRow"><button type="button" className="skillPrimaryAction" onClick={() => setEditorOpen(true)}>＋ {t("创建新技能")}</button><button type="button" onClick={() => importRef.current?.click()}>⇧ {t("导入技能")}</button><input ref={importRef} hidden type="file" accept="application/json,.json" onChange={(e) => { const file = e.target.files?.[0]; if (file) importSkill(file); }} /></div>
        <div className="skillTabs">
          <button className={tab === "official" ? "active" : ""} onClick={() => setTab("official")}>{uiLang === "en" ? `Built-in (${skillRegistry.length})` : `官方技能 (${skillRegistry.length})`}</button>
          <button className={tab === "mine" ? "active" : ""} onClick={() => setTab("mine")}>{uiLang === "en" ? `My skills (${createdCount})` : `我的技能 (${createdCount})`}</button>
          <button className={tab === "imported" ? "active" : ""} onClick={() => setTab("imported")}>{uiLang === "en" ? `Imported (${importedCount})` : `已导入 (${importedCount})`}</button>
        </div>
        <div className="skillList">
          {tab === "official" ? officialShown.map((skill) => <button type="button" key={skill.id} className={`skillCard ${selected === skill.id ? "selected" : ""}`} onClick={() => choose(skill.id)}><span className={`skillIcon ${skill.id}`}>{skill.icon}</span><span className="skillCopy"><strong>{t(skill.name)}</strong><small>{t(skill.description)}</small></span><span className="builtin">{t("内置")}</span></button>) : customShown.map((skill) => <div className="customSkillWrap" key={skill.id}><button type="button" className={`skillCard ${activeCustomId === skill.id ? "selected" : ""}`} onClick={() => chooseCustom(skill)}><span className="skillIcon custom">✦</span><span className="skillCopy"><strong>{skill.name}</strong><small>{t(skill.description)}</small></span><span className="builtin">{skill.source === "imported" ? t("导入") : t("自建")}</span></button><button type="button" className="skillDeleteButton" onClick={() => deleteCustomSkill(skill)} title={uiLang === "en" ? `Delete ${skill.name}` : `删除 ${skill.name}`} aria-label={uiLang === "en" ? `Delete ${skill.name}` : `删除 ${skill.name}`}>×</button></div>)}
          {tab !== "official" && !customShown.length && <div className="skillEmpty">{t("还没有技能。可点击上方“创建新技能”或“导入技能”。")}</div>}
        </div>
      </>}
    </aside>
    {editorOpen && <div className="skillModalBackdrop" data-no-ui-translate><div className="skillEditor"><button type="button" className="close" onClick={() => setEditorOpen(false)}>×</button><span>CREATE SKILL</span><h3>{t("创建自定义技能")}</h3><label>{t("技能名称")}<input value={name} onChange={(e) => setName(e.target.value)} placeholder={t("例如：会议纪要整理")} /></label><label>{t("技能说明")}<input value={description} onChange={(e) => setDescription(e.target.value)} placeholder={t("简短说明用途")} /></label><label>{t("执行指令")}<textarea value={prompt} onChange={(e) => setPrompt(e.target.value)} placeholder={t("写清楚模型执行该技能时必须遵循的规则…")} /></label><button type="button" className="primary" disabled={!name.trim() || !prompt.trim()} onClick={createSkill}>{t("创建技能")}</button><small>{t("当前 Demo 自定义技能保存在浏览器本地；选中后会通过当前 AnythingLLM Workspace 执行。导入格式：JSON，至少包含 name 和 prompt。")}</small></div></div>}
    <style jsx global>{`
      .brandMark{font-size:0!important;background-image:url('/xjtlu-campus-logo.svg')!important;background-size:cover!important;background-position:center!important;background-color:transparent!important;border-radius:14px!important}
      .dashboardShell:has(.skillRailCollapsed){grid-template-columns:220px minmax(0,1fr) 72px!important}
      .skillRail{transition:width .2s ease,padding .2s ease;overflow:visible!important}.skillRailCollapsed{width:72px!important;min-width:72px!important;padding:0!important;background:#fff;border-left:1px solid #e7eaf0}.skillRailMini{height:100%;display:flex;justify-content:flex-start;align-items:center;padding-top:18px}.skillMiniExpand{width:50px;min-height:126px;border:1px solid #d9def3;background:linear-gradient(180deg,#f2f1ff,#fff);border-radius:15px;color:#5963da;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:9px;cursor:pointer;box-shadow:0 8px 22px #5963da14}.skillMiniExpand:hover{border-color:#7c84ef;box-shadow:0 10px 26px #5963da24}.skillMiniExpand b{font-size:28px;line-height:1}.skillMiniExpand span{writing-mode:vertical-rl;letter-spacing:.16em;font-size:12px;font-weight:800}.skillMiniExpand i{width:8px;height:8px;border-radius:50%;background:#655ee8;box-shadow:0 0 0 4px #efedff}
      .skillEdgeCollapse{position:absolute;left:-18px;top:82px;width:36px;height:82px;border:1px solid #d9def3;background:#fff;border-radius:12px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:3px;color:#5c66d8;cursor:pointer;box-shadow:0 8px 24px #33426a18;z-index:10}.skillEdgeCollapse:hover{background:#f5f4ff;border-color:#8189ee}.skillEdgeCollapse b{font-size:24px;line-height:1}.skillEdgeCollapse span{font-size:10px;font-weight:800;writing-mode:vertical-rl;letter-spacing:.08em}.skillClearButton{border:0!important;background:transparent!important;color:#6876d8!important;padding:6px!important;cursor:pointer}
      .skillSearch{display:flex!important;align-items:center!important;gap:7px!important}.skillSearch input{width:100%;border:0;outline:0;background:transparent;font:inherit;color:inherit}.skillSearch input::placeholder{color:#9aa4ad}
      .skillCreateRow{display:grid;grid-template-columns:1fr 1fr;gap:8px;margin:10px 0 12px}.skillCreateRow button{border:1px solid #cfd7ef;border-radius:10px;padding:9px 8px;background:#fff;color:#5361c9;font-size:12px;font-weight:700;cursor:pointer}.skillCreateRow .skillPrimaryAction{background:#5b5eea;color:#fff;border-color:#5b5eea}
      .skillTabs{display:grid;grid-template-columns:repeat(3,1fr);border-bottom:1px solid #e8ebf1;margin-bottom:10px}.skillTabs button{border:0;background:transparent;padding:9px 2px 8px;color:#8a94a1;font-size:11px;cursor:pointer;border-bottom:2px solid transparent}.skillTabs button.active{color:#5861d9;border-bottom-color:#5861d9;font-weight:800}
      .skillEmpty{padding:22px 12px;text-align:center;color:#9099a3;font-size:12px;line-height:1.6}.skillIcon.custom{background:#f0edff;color:#6658d9}
      .customSkillWrap{position:relative}.customSkillWrap .skillCard{width:100%;padding-right:48px!important}.skillDeleteButton{position:absolute;right:10px;top:10px;width:28px;height:28px;border:1px solid #e3e6ed;border-radius:8px;background:#fff;color:#8b95a1;font-size:18px;line-height:1;display:grid;place-items:center;cursor:pointer;z-index:2;transition:all .15s ease}.skillDeleteButton:hover{background:#fff0f0;border-color:#f0b7b7;color:#c43d3d}.customSkillWrap:has(.skillCard.selected) .skillDeleteButton{border-color:#d3d4fb;background:#faf9ff}
      .skillModalBackdrop{position:fixed;inset:0;background:#17203355;display:grid;place-items:center;z-index:80;padding:20px}.skillEditor{position:relative;width:min(480px,100%);background:white;border-radius:18px;padding:24px;box-shadow:0 24px 80px #12213a35}.skillEditor>span{font-size:10px;letter-spacing:.15em;color:#6670dd;font-weight:800}.skillEditor h3{margin:5px 0 18px;font-size:20px}.skillEditor label{display:block;font-size:12px;color:#5d6974;margin:11px 0}.skillEditor input,.skillEditor textarea{display:block;width:100%;margin-top:6px;border:1px solid #dce1e8;border-radius:10px;padding:10px 11px;font:inherit}.skillEditor textarea{min-height:130px;resize:vertical}.skillEditor .primary{margin-top:8px;width:100%;background:#5b5eea}.skillEditor small{display:block;margin-top:12px;color:#89939c;line-height:1.6}
      .sideNav a[href='/dashboard']{margin-top:12px!important;border-top:1px solid #eceff3!important;padding-top:17px!important}.sideNav a[href='/dashboard'],.sideNav a[href='/feedback'],.sideNav a[href='/settings']{color:#64717d!important}.sideNav a[href='/dashboard']:hover,.sideNav a[href='/feedback']:hover,.sideNav a[href='/settings']:hover{background:#f5f6fb!important;color:#4f5ed0!important}
      @media(max-width:1050px){.dashboardShell:has(.skillRailCollapsed){grid-template-columns:180px minmax(0,1fr) 64px!important}.skillRailCollapsed{width:64px!important;min-width:64px!important}.skillMiniExpand{width:46px}}
    `}</style>
  </>;
}
