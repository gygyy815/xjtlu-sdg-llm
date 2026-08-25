"use client";

import { createContext, useContext, useEffect, useMemo, useState, type ReactNode } from "react";

export type ProductLang = "zh" | "en";

type ProductLanguageContextValue = {
  lang: ProductLang;
  setLang: (lang: ProductLang) => void;
  t: (zh: string, en: string) => string;
};

const STORAGE_KEY = "xjtlu-ui-language";
const ProductLanguageContext = createContext<ProductLanguageContextValue | null>(null);

export function ProductLanguageProvider({ children }: { children: ReactNode }) {
  const [lang, setLangState] = useState<ProductLang>("zh");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "zh";
    setLangState(stored);
    document.documentElement.lang = stored === "en" ? "en" : "zh-CN";
  }, []);

  function setLang(next: ProductLang) {
    setLangState(next);
    localStorage.setItem(STORAGE_KEY, next);
    document.documentElement.lang = next === "en" ? "en" : "zh-CN";
    window.dispatchEvent(new CustomEvent("xjtlu-ui-language-change", { detail: { lang: next } }));
  }

  const value = useMemo<ProductLanguageContextValue>(() => ({
    lang,
    setLang,
    t: (zh, en) => lang === "en" ? en : zh,
  }), [lang]);

  return <ProductLanguageContext.Provider value={value}>{children}</ProductLanguageContext.Provider>;
}

export function useProductLanguage() {
  const value = useContext(ProductLanguageContext);
  if (!value) throw new Error("useProductLanguage must be used inside ProductLanguageProvider");
  return value;
}
