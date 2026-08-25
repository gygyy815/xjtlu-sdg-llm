"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";
import type { UiLang } from "@/lib/ui-i18n";

const SKILL_COLLAPSE_KEY = "xjtlu-skill-rail-collapsed";

type WorkspaceDomOption = { value: string; label: string };

export function FriendlyUiController() {
  const [composerHost, setComposerHost] = useState<HTMLElement | null>(null);
  const [skillHost, setSkillHost] = useState<HTMLElement | null>(null);
  const [workspaceSelect, setWorkspaceSelect] = useState<HTMLSelectElement | null>(null);
  const [workspaceOptions, setWorkspaceOptions] = useState<WorkspaceDomOption[]>([]);
  const [workspaceValue, setWorkspaceValue] = useState("");
  const [workspaceOpen, setWorkspaceOpen] = useState(false);
  const [workspaceQuery, setWorkspaceQuery] = useState("");
  const [skillOpen, setSkillOpen] = useState(false);
  const [uiLang, setUiLang] = useState<UiLang>("zh");

  useEffect(() => {
    const stored = localStorage.getItem("xjtlu-ui-language") === "en" ? "en" : "zh";
    setUiLang(stored);
    const onLanguage = (event: Event) => {
      const next = (event as CustomEvent<{ lang?: UiLang }>).detail?.lang === "en" ? "en" : "zh";
      setUiLang(next);
    };
    window.addEventListener("xjtlu-ui-language-change", onLanguage);
    return () => window.removeEventListener("xjtlu-ui-language-change", onLanguage);
  }, []);

  useEffect(() => {
    const syncTargets = () => {
      setComposerHost(document.querySelector<HTMLElement>(".composerActions"));
      setSkillHost(document.querySelector<HTMLElement>(".skillRail"));
      const nextSelect = document.querySelector<HTMLSelectElement>(".dashboardHeader select");
      setWorkspaceSelect(nextSelect);
      if (nextSelect) {
        nextSelect.classList.add("workspaceNativeSelect");
        setWorkspaceValue(nextSelect.value);
        setWorkspaceOptions(Array.from(nextSelect.options).map((option) => ({ value: option.value, label: option.textContent || option.value })));
      } else {
        setWorkspaceOptions([]);
        setWorkspaceValue("");
      }
    };

    syncTargets();
    const observer = new MutationObserver(syncTargets);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    if (!workspaceSelect) return;
    const onChange = () => {
      setWorkspaceValue(workspaceSelect.value);
      setWorkspaceQuery("");
      setWorkspaceOpen(false);
    };
    workspaceSelect.addEventListener("change", onChange);
    return () => workspaceSelect.removeEventListener("change", onChange);
  }, [workspaceSelect]);

  useEffect(() => {
    document.body.classList.toggle("skillPopoverOpen", skillOpen);
    if (skillOpen) {
      try { localStorage.setItem(SKILL_COLLAPSE_KEY, "0"); } catch {}
      requestAnimationFrame(() => {
        const expand = document.querySelector<HTMLButtonElement>(".skillMiniExpand");
        if (expand) expand.click();
      });
    }
    return () => document.body.classList.remove("skillPopoverOpen");
  }, [skillOpen]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setSkillOpen(false);
        setWorkspaceOpen(false);
      }
    };
    const onPointer = (event: PointerEvent) => {
      if (!workspaceOpen) return;
      const target = event.target as HTMLElement | null;
      if (!target?.closest(".workspaceSearchProxy")) setWorkspaceOpen(false);
    };
    window.addEventListener("keydown", onKey);
    window.addEventListener("pointerdown", onPointer);
    return () => {
      window.removeEventListener("keydown", onKey);
      window.removeEventListener("pointerdown", onPointer);
    };
  }, [workspaceOpen]);

  // Workspace names are source/entity names, not UI chrome. Keep the official
  // account labels unchanged across UI-language switches so partial translation
  // never produces mixed names such as “Xi'an Jiaotong-Liverpool University数学物理学院”.
  const workspaceDisplayOptions = workspaceOptions.map((item) => ({
    ...item,
    display: item.label,
  }));

  const selectedWorkspace = workspaceDisplayOptions.find((item) => item.value === workspaceValue);
  const normalizedQuery = workspaceQuery.trim().toLowerCase();
  const filteredWorkspaceOptions = workspaceDisplayOptions.filter((item) => {
    if (!normalizedQuery) return true;
    return `${item.display} ${item.label} ${item.value}`.toLowerCase().includes(normalizedQuery);
  }).slice(0, 12);

  function chooseWorkspace(value: string) {
    if (!workspaceSelect) return;
    workspaceSelect.value = value;
    workspaceSelect.dispatchEvent(new Event("change", { bubbles: true }));
    setWorkspaceValue(value);
    setWorkspaceQuery("");
    setWorkspaceOpen(false);
  }

  return <>
    {workspaceSelect?.parentElement && createPortal(
      <div className="workspaceSearchProxy">
        <button
          type="button"
          className="workspaceSearchButton"
          onClick={() => setWorkspaceOpen((value) => !value)}
          aria-expanded={workspaceOpen}
        >
          <span>{selectedWorkspace?.display || (uiLang === "en" ? "Choose a knowledge base" : "选择知识库")}</span>
          <i aria-hidden="true">⌄</i>
        </button>
        {workspaceOpen && <div className="workspaceSearchMenu">
          <input
            autoFocus
            type="search"
            value={workspaceQuery}
            onChange={(event) => setWorkspaceQuery(event.target.value)}
            placeholder={uiLang === "en" ? "Search knowledge bases…" : "搜索知识库…"}
          />
          <div className="workspaceSearchResults">
            {filteredWorkspaceOptions.length ? filteredWorkspaceOptions.map((item) => <button
              type="button"
              key={item.value}
              className={item.value === workspaceValue ? "active" : ""}
              onClick={() => chooseWorkspace(item.value)}
            >
              <strong>{item.display}</strong>
            </button>) : <p>{uiLang === "en" ? "No matching knowledge base" : "没有匹配的知识库"}</p>}
          </div>
          {workspaceDisplayOptions.length > 12 && !workspaceQuery && <small className="workspaceSearchHint">{uiLang === "en" ? `Showing the first 12 of ${workspaceDisplayOptions.length}. Type to search.` : `共 ${workspaceDisplayOptions.length} 个知识库，当前显示前 12 个，可输入关键词搜索。`}</small>}
        </div>}
      </div>,
      workspaceSelect.parentElement,
    )}

    {composerHost && createPortal(
      <button
        type="button"
        className={`composerSkillButton ${skillOpen ? "active" : ""}`}
        onClick={() => setSkillOpen((value) => !value)}
        aria-expanded={skillOpen}
        aria-controls="skill-popover"
      >
        <span aria-hidden="true">✦</span>
        <b>{uiLang === "en" ? "Skills" : "技能"}</b>
      </button>,
      composerHost,
    )}

    {skillOpen && <button
      type="button"
      className="skillPopoverBackdrop"
      aria-label={uiLang === "en" ? "Close skills" : "关闭技能面板"}
      onClick={() => setSkillOpen(false)}
    />}

    {skillOpen && skillHost && createPortal(
      <button
        type="button"
        className="skillPopoverClose"
        onClick={() => setSkillOpen(false)}
        aria-label={uiLang === "en" ? "Close skills" : "关闭技能面板"}
        title={uiLang === "en" ? "Close" : "关闭"}
      >×</button>,
      skillHost,
    )}
  </>;
}
