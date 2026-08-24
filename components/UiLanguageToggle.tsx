"use client";

import { CSSProperties, PointerEvent as ReactPointerEvent, useEffect, useRef, useState } from "react";
import { containsChineseUi, translateUiText, type UiLang } from "@/lib/ui-i18n";
import { translateUiExtra } from "@/lib/ui-i18n-extra";
import { translateUiBidirectional } from "@/lib/ui-bilingual-extra";

const STORAGE_KEY = "xjtlu-ui-language";
const POSITION_KEY = "xjtlu-ui-language-toggle-position-v1";
const originalText = new WeakMap<Text, string>();
const lastAppliedText = new WeakMap<Text, string>();
const originalAttrs = new WeakMap<Element, Record<string, string>>();
const lastAppliedAttrs = new WeakMap<Element, Record<string, string>>();

const CONTENT_SKIP_SELECTOR = [
  "[data-no-ui-translate]",
  ".markdownMessage",
  ".message.user .messageBody > p",
  ".attachmentChip strong",
  ".fileCardHead strong",
  ".sheetPreview",
  ".citations article p",
  ".historyMessage p",
  ".conversationList strong",
  ".conversationList p",
  ".detailHead h2",
  ".markmapStage",
  ".articleCard h3",
  ".articleCard p",
  ".articleTitle",
  ".articleBody",
  ".articleDigest p",
  ".detailFacts strong",
  "pre",
  "code",
].join(",");

function shouldSkip(node: Text) {
  return Boolean(node.parentElement?.closest(CONTENT_SKIP_SELECTOR));
}

function translateForLanguage(value: string, lang: UiLang) {
  const supplemental = translateUiBidirectional(value, lang);
  if (supplemental !== value) return supplemental;
  if (lang === "zh") return value;
  const base = translateUiText(value);
  return base === value ? translateUiExtra(value) : base;
}

function sourceForText(node: Text) {
  const current = node.nodeValue || "";
  const previousApplied = lastAppliedText.get(node);
  if (!originalText.has(node) || (previousApplied !== undefined && current !== previousApplied)) originalText.set(node, current);
  return originalText.get(node) || current;
}

function sourceForAttr(element: Element, attr: string) {
  const current = element.getAttribute(attr) || "";
  const originals = originalAttrs.get(element) || {};
  const applied = lastAppliedAttrs.get(element) || {};
  if (!Object.prototype.hasOwnProperty.call(originals, attr) || (applied[attr] !== undefined && current !== applied[attr])) {
    originals[attr] = current;
    originalAttrs.set(element, originals);
  }
  return originals[attr] || current;
}

function rememberAppliedAttr(element: Element, attr: string, value: string) {
  const applied = lastAppliedAttrs.get(element) || {};
  applied[attr] = value;
  lastAppliedAttrs.set(element, applied);
}

function auditUntranslatedUi() {
  if (process.env.NODE_ENV === "production") return;
  const leaks = new Set<string>();
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    const text = (node.nodeValue || "").trim();
    if (text && containsChineseUi(text) && !shouldSkip(node)) {
      const parent = node.parentElement;
      const visible = !parent || parent.getClientRects().length > 0;
      if (visible) leaks.add(text.replace(/\s+/g, " ").slice(0, 180));
    }
    node = walker.nextNode() as Text | null;
  }
  document.documentElement.dataset.uiI18nLeaks = String(leaks.size);
  if (leaks.size) console.warn("[XJTLU i18n] untranslated visible UI text:", [...leaks]);
  else console.info("[XJTLU i18n] English UI audit passed: no visible Chinese UI labels detected on this route.");
}

function applyLanguage(lang: UiLang) {
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  document.documentElement.dataset.uiLanguage = lang;

  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    if (!shouldSkip(node)) {
      const original = sourceForText(node);
      const trimmed = original.trim();
      if (trimmed) {
        const output = translateForLanguage(trimmed, lang);
        const leading = original.match(/^\s*/)?.[0] || "";
        const trailing = original.match(/\s*$/)?.[0] || "";
        const desired = `${leading}${output}${trailing}`;
        if (node.nodeValue !== desired) node.nodeValue = desired;
        lastAppliedText.set(node, desired);
      }
    }
    node = walker.nextNode() as Text | null;
  }

  document.querySelectorAll("input[placeholder],textarea[placeholder],[title],[aria-label]").forEach((element) => {
    if (element.closest(CONTENT_SKIP_SELECTOR)) return;
    ["placeholder", "title", "aria-label"].forEach((attr) => {
      if (!element.hasAttribute(attr)) return;
      const original = sourceForAttr(element, attr);
      if (!original) return;
      const desired = translateForLanguage(original, lang);
      if (element.getAttribute(attr) !== desired) element.setAttribute(attr, desired);
      rememberAppliedAttr(element, attr, desired);
    });
  });

  if (lang === "en") window.setTimeout(auditUntranslatedUi, 0);
  else delete document.documentElement.dataset.uiI18nLeaks;
}

type Position = { x: number; y: number };
const WIDGET_WIDTH = 142;
const WIDGET_HEIGHT = 50;
const EDGE = 12;

function clampPosition(position: Position): Position {
  if (typeof window === "undefined") return position;
  return {
    x: Math.min(Math.max(EDGE, position.x), Math.max(EDGE, window.innerWidth - WIDGET_WIDTH - EDGE)),
    y: Math.min(Math.max(EDGE, position.y), Math.max(EDGE, window.innerHeight - WIDGET_HEIGHT - EDGE)),
  };
}

export function UiLanguageToggle() {
  const [lang, setLang] = useState<UiLang>("zh");
  const [position, setPosition] = useState<Position | null>(null);
  const [dragging, setDragging] = useState(false);
  const langRef = useRef<UiLang>("zh");
  const scheduled = useRef<number | null>(null);
  const dragRef = useRef<{ pointerId: number; dx: number; dy: number } | null>(null);

  useEffect(() => {
    const stored: UiLang = localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "zh";
    langRef.current = stored;
    setLang(stored);
    applyLanguage(stored);

    let initial: Position = { x: Math.max(EDGE, window.innerWidth - WIDGET_WIDTH - 20), y: 12 };
    try {
      const saved = JSON.parse(localStorage.getItem(POSITION_KEY) || "null");
      if (saved && Number.isFinite(saved.x) && Number.isFinite(saved.y)) initial = saved;
    } catch {}
    setPosition(clampPosition(initial));

    const observer = new MutationObserver(() => {
      if (scheduled.current !== null) cancelAnimationFrame(scheduled.current);
      scheduled.current = requestAnimationFrame(() => {
        scheduled.current = null;
        applyLanguage(langRef.current);
      });
    });
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label"] });

    const onResize = () => setPosition((current) => current ? clampPosition(current) : current);
    window.addEventListener("resize", onResize);
    return () => {
      observer.disconnect();
      window.removeEventListener("resize", onResize);
      if (scheduled.current !== null) cancelAnimationFrame(scheduled.current);
    };
  }, []);

  useEffect(() => {
    if (!dragging) return;
    const onMove = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      setPosition(clampPosition({ x: event.clientX - drag.dx, y: event.clientY - drag.dy }));
    };
    const onUp = (event: PointerEvent) => {
      const drag = dragRef.current;
      if (!drag || event.pointerId !== drag.pointerId) return;
      setDragging(false);
      dragRef.current = null;
      setPosition((current) => {
        if (current) localStorage.setItem(POSITION_KEY, JSON.stringify(current));
        return current;
      });
    };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [dragging]);

  function startDrag(event: ReactPointerEvent<HTMLButtonElement>) {
    if (!position) return;
    dragRef.current = { pointerId: event.pointerId, dx: event.clientX - position.x, dy: event.clientY - position.y };
    setDragging(true);
    event.currentTarget.setPointerCapture?.(event.pointerId);
    event.preventDefault();
  }

  function switchTo(next: UiLang) {
    langRef.current = next;
    setLang(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyLanguage(next);
    window.setTimeout(() => applyLanguage(next), 80);
    window.dispatchEvent(new CustomEvent("xjtlu-ui-language-change", { detail: { lang: next } }));
  }

  const style = position ? ({ "--ui-lang-x": `${position.x}px`, "--ui-lang-y": `${position.y}px` } as CSSProperties) : undefined;

  return <div className={`uiLanguageToggle ${dragging ? "dragging" : ""}`} style={style} data-no-ui-translate>
    <button type="button" className="uiLanguageDrag" onPointerDown={startDrag} title={lang === "en" ? "Drag to move" : "拖动移动"} aria-label={lang === "en" ? "Drag language switch" : "拖动语言切换器"}>⠿</button>
    <button type="button" className={lang === "zh" ? "active" : ""} onClick={() => switchTo("zh")}>中文</button>
    <button type="button" className={lang === "en" ? "active" : ""} onClick={() => switchTo("en")}>EN</button>
    <style jsx global>{`
      .uiLanguageToggle{position:fixed!important;left:var(--ui-lang-x,calc(100vw - 162px))!important;top:var(--ui-lang-y,12px)!important;right:auto!important;bottom:auto!important;z-index:160;display:flex;align-items:center;gap:4px;padding:5px;background:rgba(255,255,255,.98);border:1px solid #d6e5dd;border-radius:14px;box-shadow:0 9px 28px #24334d18;font-size:13px;color:#718079;user-select:none;touch-action:none}.uiLanguageToggle.dragging{box-shadow:0 14px 36px #24334d28;cursor:grabbing}.uiLanguageToggle button{border:0;background:transparent;min-width:48px;min-height:36px;padding:8px 11px;border-radius:9px;color:#65766e;font:inherit;font-weight:800;cursor:pointer}.uiLanguageToggle button.active{background:#e3f1e9;color:#245f4c}.uiLanguageToggle .uiLanguageDrag{min-width:27px;width:27px;padding:0;color:#799087;font-size:17px;cursor:grab}.uiLanguageToggle.dragging .uiLanguageDrag{cursor:grabbing;background:#eef6f2}.uiLanguageToggle .uiLanguageDrag:hover{background:#f1f7f4;color:#2f755d}
      html[data-ui-language='en'] .surveyCard .sectionHead small,
      html[data-ui-language='en'] .surveyInstructions p:nth-child(2),
      html[data-ui-language='en'] .e1Block legend small,
      html[data-ui-language='en'] .ratingRow small,
      html[data-ui-language='en'] .openQuestions small{display:none!important}
    `}</style>
  </div>;
}
