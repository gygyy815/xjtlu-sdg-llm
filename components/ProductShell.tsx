"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useProductLanguage } from "@/lib/product-language";

const NAV_ITEMS = [
  { href: "/", zh: "问助手", en: "Ask AI", icon: "○" },
  { href: "/history", zh: "对话历史", en: "Chat history", icon: "◷" },
  { href: "/articles", zh: "浏览知识", en: "Browse knowledge", icon: "▤" },
  { href: "/feedback", zh: "反馈与建议", en: "Feedback", icon: "◇" },
  { href: "/agent-settings", zh: "Agent 设置", en: "Agent Settings", icon: "✦" },
  { href: "/settings", zh: "设置", en: "Settings", icon: "⚙" },
] as const;

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ProductShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { lang, setLang, t } = useProductLanguage();

  return <div className="productShell" data-product-shell>
    <aside className="productSidebar">
      <Link href="/" className="productBrand" aria-label={t("返回校园知识助手", "Back to campus knowledge assistant")}>
        <span className="productBrandMark">XJ</span>
        <span className="productBrandCopy"><strong>{t("XJTLU 校园知识助手", "XJTLU Campus Knowledge Assistant")}</strong><small>{t("校园知识助手", "Campus Knowledge Assistant")}</small></span>
      </Link>

      <Link href="/" className="productNewChat"><span aria-hidden="true">＋</span>{t("新建对话", "New chat")}</Link>

      <button type="button" className="productSearchButton" onClick={() => window.dispatchEvent(new Event("xjtlu-focus-chat"))}>
        <span aria-hidden="true">⌕</span><span>{t("搜索", "Search")}</span><kbd>Ctrl K</kbd>
      </button>

      <nav className="productNav" aria-label={t("主要导航", "Main navigation")}>
        {NAV_ITEMS.map((item) => <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? "active" : undefined}>
          <span className="productNavIcon" aria-hidden="true">{item.icon}</span>
          <span>{lang === "en" ? item.en : item.zh}</span>
        </Link>)}
      </nav>

      <div className="productSidebarFoot">
        <span>{t("快捷访问", "Quick access")}</span>
        <strong>{t("当前知识库会显示在对话顶部", "The active knowledge base appears above the chat")}</strong>
        <small>AnythingLLM · SURF-2026-0395</small>
      </div>
    </aside>

    <section className="productStage">
      <header className="productTopbar">
        <Link href="/history" className="productHistoryLink"><span aria-hidden="true">◷</span>{t("对话历史", "Chat history")}</Link>
        <div className="productTopbarActions">
          {pathname !== "/" && <Link href="/" className="productBackLink">{t("返回问答", "Back to chat")}</Link>}
          <div className="productLanguageSwitch" role="group" aria-label={t("界面语言", "Interface language")}>
            <button type="button" className={lang === "zh" ? "active" : undefined} onClick={() => setLang("zh")}>中文</button>
            <button type="button" className={lang === "en" ? "active" : undefined} onClick={() => setLang("en")}>EN</button>
          </div>
        </div>
      </header>
      <div className="productContent">{children}</div>
    </section>
  </div>;
}
