"use client";

import { useEffect, useRef, useState } from "react";
import { containsChineseUi, translateUiText, type UiLang } from "@/lib/ui-i18n";

const STORAGE_KEY = "xjtlu-ui-language";
const originalText = new WeakMap<Text, string>();
const originalAttrs = new WeakMap<Element, Record<string, string>>();

// Skip user/LLM/source-document content, but do NOT skip the surrounding UI controls.
// This is deliberately narrower than the previous `.messageBody/.citations/.fileCard` rule,
// which prevented labels such as Sources, Open source, status badges and graph controls
// from switching to English.
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

function translated(value: string) {
  return translateUiText(value);
}

function sourceForText(node: Text, lang: UiLang) {
  const current = node.nodeValue || "";
  if (!originalText.has(node)) originalText.set(node, current);
  // React can replace translated text with freshly rendered Chinese copy. In English mode,
  // treat that fresh Chinese value as the new canonical source and translate it again.
  else if (lang === "en" && containsChineseUi(current)) originalText.set(node, current);
  return originalText.get(node) || current;
}

function sourceForAttr(element: Element, attr: string, lang: UiLang) {
  const current = element.getAttribute(attr) || "";
  const cached = originalAttrs.get(element) || {};
  if (!cached[attr] || (lang === "en" && containsChineseUi(current))) cached[attr] = current;
  originalAttrs.set(element, cached);
  return cached[attr] || current;
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
      const original = sourceForText(node, lang);
      const trimmed = original.trim();
      if (trimmed) {
        const output = lang === "en" ? translated(trimmed) : trimmed;
        const leading = original.match(/^\s*/)?.[0] || "";
        const trailing = original.match(/\s*$/)?.[0] || "";
        const desired = `${leading}${output}${trailing}`;
        if (node.nodeValue !== desired) node.nodeValue = desired;
      }
    }
    node = walker.nextNode() as Text | null;
  }

  document.querySelectorAll("input[placeholder],textarea[placeholder],[title],[aria-label]").forEach((element) => {
    if (element.closest(CONTENT_SKIP_SELECTOR)) return;
    ["placeholder", "title", "aria-label"].forEach((attr) => {
      if (!element.hasAttribute(attr)) return;
      const original = sourceForAttr(element, attr, lang);
      if (!original) return;
      const desired = lang === "en" ? translated(original) : original;
      if (element.getAttribute(attr) !== desired) element.setAttribute(attr, desired);
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
    observer.observe(document.body, { childList: true, subtree: true, characterData: true, attributes: true, attributeFilter: ["placeholder", "title", "aria-label"] });
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
    // Run a second pass after React/state updates caused by the language event.
    window.setTimeout(() => applyLanguage(next), 80);
    window.dispatchEvent(new CustomEvent("xjtlu-ui-language-change", { detail: { lang: next } }));
  }

  return <div className="uiLanguageToggle" data-no-ui-translate>
    <button className={lang === "zh" ? "active" : ""} onClick={() => switchTo("zh")}>中文</button>
    <span>/</span>
    <button className={lang === "en" ? "active" : ""} onClick={() => switchTo("en")}>EN</button>
    <style jsx>{`
      .uiLanguageToggle{position:fixed;right:22px;bottom:22px;z-index:120;display:flex;align-items:center;gap:5px;padding:7px 9px;background:#fff;border:1px solid #dfe4ea;border-radius:999px;box-shadow:0 10px 30px #24334d22;font-size:11px;color:#8a949e}.uiLanguageToggle button{border:0;background:transparent;padding:4px 6px;border-radius:999px;color:#7b8690;font:inherit;font-weight:800;cursor:pointer}.uiLanguageToggle button.active{background:#5f63e8;color:#fff}.uiLanguageToggle span{color:#c3c8cf}@media(max-width:620px){.uiLanguageToggle{right:12px;bottom:12px}}
    `}</style>
  </div>;
}
