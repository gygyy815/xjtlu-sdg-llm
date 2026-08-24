"use client";

import { useEffect, useState } from "react";
import { createPortal } from "react-dom";

const SKILL_COLLAPSE_KEY = "xjtlu-skill-rail-collapsed";

export function FriendlyUiController() {
  const [composerHost, setComposerHost] = useState<HTMLElement | null>(null);
  const [skillHost, setSkillHost] = useState<HTMLElement | null>(null);
  const [skillOpen, setSkillOpen] = useState(false);

  useEffect(() => {
    const syncTargets = () => {
      setComposerHost(document.querySelector<HTMLElement>(".composerActions"));
      setSkillHost(document.querySelector<HTMLElement>(".skillRail"));
    };

    syncTargets();
    const observer = new MutationObserver(syncTargets);
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

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
      if (event.key === "Escape") setSkillOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  return <>
    {composerHost && createPortal(
      <button
        type="button"
        className={`composerSkillButton ${skillOpen ? "active" : ""}`}
        onClick={() => setSkillOpen((value) => !value)}
        aria-expanded={skillOpen}
        aria-controls="skill-popover"
      >
        <span aria-hidden="true">✦</span>
        <b>技能</b>
      </button>,
      composerHost,
    )}

    {skillOpen && <button
      type="button"
      className="skillPopoverBackdrop"
      aria-label="关闭技能面板"
      onClick={() => setSkillOpen(false)}
    />}

    {skillOpen && skillHost && createPortal(
      <button
        type="button"
        className="skillPopoverClose"
        onClick={() => setSkillOpen(false)}
        aria-label="关闭技能面板"
        title="关闭"
      >×</button>,
      skillHost,
    )}
  </>;
}
