"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useProductLanguage } from "@/lib/product-language";

const NAV_ITEMS = [
  { href: "/", zh: "问助手", en: "Ask AI", icon: "○" },
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
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setSidebarCollapsed(localStorage.getItem("xjtlu-sidebar-collapsed") === "true");
  }, []);

  useEffect(() => {
    const toggleSidebar = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setSidebarCollapsed((value) => {
          localStorage.setItem("xjtlu-sidebar-collapsed", String(!value));
          return !value;
        });
      }
    };
    window.addEventListener("keydown", toggleSidebar);
    return () => window.removeEventListener("keydown", toggleSidebar);
  }, []);

  const toggleSidebar = () => setSidebarCollapsed((value) => {
    localStorage.setItem("xjtlu-sidebar-collapsed", String(!value));
    return !value;
  });

  return <div className="productShell" data-product-shell data-sidebar-collapsed={sidebarCollapsed} data-lang={lang}>
    <aside className="productSidebar">
      <button
        type="button"
        className="productSidebarToggle"
        onClick={toggleSidebar}
        aria-label={sidebarCollapsed ? t("展开侧栏", "Expand sidebar") : t("收起侧栏", "Collapse sidebar")}
        aria-expanded={!sidebarCollapsed}
        title={`${sidebarCollapsed ? t("展开侧栏", "Expand sidebar") : t("收起侧栏", "Collapse sidebar")} (Ctrl+B)`}
      >
        <span className="sidebarPanelIcon" aria-hidden="true"><i/><i/><i/></span>
        <span className="sidebarToggleArrow" aria-hidden="true">{sidebarCollapsed ? "›" : "‹"}</span>
      </button>
      <Link href="/" className="productBrand" aria-label={t("返回校园知识助手", "Back to campus knowledge assistant")}>
        <span className="productBrandMark">XJ</span>
        <span className="productBrandCopy"><strong>{t("XJTLU 校园知识助手", "XJTLU Campus Knowledge Assistant")}</strong><small>{t("校园知识助手", "Campus Knowledge Assistant")}</small></span>
      </Link>

      <Link href="/" className="productNewChat" aria-label={t("新建对话", "New chat")} title={sidebarCollapsed ? t("新建对话", "New chat") : undefined}><span aria-hidden="true">＋</span><span>{t("新建对话", "New chat")}</span></Link>

      <button type="button" className="productSearchButton" onClick={() => window.dispatchEvent(new Event("xjtlu-focus-chat"))}>
        <span aria-hidden="true">⌕</span><span>{t("搜索", "Search")}</span><kbd>Ctrl K</kbd>
      </button>

      <nav className="productNav" aria-label={t("主要导航", "Main navigation")}>
        {NAV_ITEMS.map((item) => <Link key={item.href} href={item.href} aria-label={lang === "en" ? item.en : item.zh} title={sidebarCollapsed ? (lang === "en" ? item.en : item.zh) : undefined} className={isActive(pathname, item.href) ? "active" : undefined}>
          <span className="productNavIcon" aria-hidden="true">{item.icon}</span>
          <span>{lang === "en" ? item.en : item.zh}</span>
        </Link>)}
      </nav>

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
