"use client";

import { useEffect, useRef, useState } from "react";
import { containsChineseUi, translateUiText, type UiLang } from "@/lib/ui-i18n";
import { translateUiExtra } from "@/lib/ui-i18n-extra";
import { translateUiBidirectional } from "@/lib/ui-bilingual-extra";

const STORAGE_KEY = "xjtlu-ui-language";
const originalText = new WeakMap<Text, string>();
const lastAppliedText = new WeakMap<Text, string>();
const originalAttrs = new WeakMap<Element, Record<string, string>>();
const lastAppliedAttrs = new WeakMap<Element, Record<string, string>>();

// Skip user/LLM/source-document content, but keep surrounding UI controls translatable.
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
  if (!originalText.has(node) || (previousApplied !== undefined && current !== previousApplied)) {
    originalText.set(node, current);
  }
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

export function UiLanguageToggle() {
  const [lang, setLang] = useState<UiLang>("zh");
  const langRef = useRef<UiLang>("zh");
  const scheduled = useRef<number | null>(null);

  useEffect(() => {
    const stored: UiLang = localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "zh";
    langRef.current = stored;
    setLang(stored);
    applyLanguage(stored);

    const observer = new MutationObserver(() => {
      if (scheduled.current !== null) cancelAnimationFrame(scheduled.current);
      scheduled.current = requestAnimationFrame(() => {
        scheduled.current = null;
        applyLanguage(langRef.current);
      });
    });
    observer.observe(document.body, {
      childList: true,
      subtree: true,
      characterData: true,
      attributes: true,
      attributeFilter: ["placeholder", "title", "aria-label"],
    });
    return () => {
      observer.disconnect();
      if (scheduled.current !== null) cancelAnimationFrame(scheduled.current);
    };
  }, []);

  function switchTo(next: UiLang) {
    langRef.current = next;
    setLang(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyLanguage(next);
    window.setTimeout(() => applyLanguage(next), 80);
    window.dispatchEvent(new CustomEvent("xjtlu-ui-language-change", { detail: { lang: next } }));
  }

  return <div className="uiLanguageToggle" data-no-ui-translate>
    <button className={lang === "zh" ? "active" : ""} onClick={() => switchTo("zh")}>中文</button>
    <span>/</span>
    <button className={lang === "en" ? "active" : ""} onClick={() => switchTo("en")}>EN</button>
    <style jsx global>{`
      .uiLanguageToggle{position:fixed;right:20px;top:12px;bottom:auto;z-index:120;display:flex;align-items:center;gap:3px;padding:5px;background:#fff;border:1px solid #dce7e1;border-radius:12px;box-shadow:0 8px 24px #24334d14;font-size:12px;color:#7f8d86}.uiLanguageToggle button{border:0;background:transparent;min-width:46px;padding:8px 10px;border-radius:9px;color:#6f7f77;font:inherit;font-weight:800;cursor:pointer}.uiLanguageToggle button.active{background:#e8f4ee;color:#28684f}.uiLanguageToggle span{display:none}@media(max-width:620px){.uiLanguageToggle{top:auto;right:12px;bottom:12px}}
      html[data-ui-language='en'] .surveyCard .sectionHead small,
      html[data-ui-language='en'] .surveyInstructions p:nth-child(2),
      html[data-ui-language='en'] .e1Block legend small,
      html[data-ui-language='en'] .ratingRow small,
      html[data-ui-language='en'] .openQuestions small{display:none!important}
    `}</style>
  </div>;
}
