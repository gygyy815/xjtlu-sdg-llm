"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useProductLanguage } from "@/lib/product-language";

const NAV_ITEMS = [
  { href: "/", zh: "问助手", en: "Ask AI", icon: "message" },
  { href: "/articles", zh: "浏览知识", en: "Browse knowledge", icon: "library" },
  { href: "/feedback", zh: "反馈与建议", en: "Feedback", icon: "feedback" },
  { href: "/agent-settings", zh: "Agent 设置", en: "Agent settings", icon: "sparkles" },
  { href: "/settings", zh: "设置", en: "Settings", icon: "settings" },
] as const;

type ProductIconName = typeof NAV_ITEMS[number]["icon"] | "plus" | "search" | "history" | "panel-left";

function ProductIcon({ name }: { name: ProductIconName }) {
  const paths: Record<ProductIconName, ReactNode> = {
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></>,
    library: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8M8 11h6"/></>,
    feedback: <><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.8 9.8 0 0 1-4-.8L3 21l1.7-4.2A8.5 8.5 0 1 1 21 11.5z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></>,
    sparkles: <><path d="m12 3-1.3 3.7L7 8l3.7 1.3L12 13l1.3-3.7L17 8l-3.7-1.3z"/><path d="m5 14-.8 2.2L2 17l2.2.8L5 20l.8-2.2L8 17l-2.2-.8z"/><path d="m19 14-.8 2.2L16 17l2.2.8L19 20l.8-2.2L22 17l-2.2-.8z"/></>,
    settings: <><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1-2.8 2.8-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.6v.2h-4V21a1.7 1.7 0 0 0-1-1.6 1.7 1.7 0 0 0-1.9.3l-.1.1L4.2 17l.1-.1a1.7 1.7 0 0 0 .3-1.9A1.7 1.7 0 0 0 3 14H2.8v-4H3a1.7 1.7 0 0 0 1.6-1 1.7 1.7 0 0 0-.3-1.9L4.2 7 7 4.2l.1.1A1.7 1.7 0 0 0 9 4.6 1.7 1.7 0 0 0 10 3V2.8h4V3a1.7 1.7 0 0 0 1 1.6 1.7 1.7 0 0 0 1.9-.3l.1-.1L19.8 7l-.1.1a1.7 1.7 0 0 0-.3 1.9 1.7 1.7 0 0 0 1.6 1h.2v4H21a1.7 1.7 0 0 0-1.6 1z"/></>,
    plus: <path d="M12 5v14M5 12h14"/>,
    search: <><circle cx="11" cy="11" r="7"/><path d="m20 20-4-4"/></>,
    history: <><path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/></>,
    "panel-left": <><rect x="3" y="4" width="18" height="16" rx="2"/><path d="M9 4v16"/></>,
  };
  return <svg className="productIconSvg" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{paths[name]}</svg>;
}

function isActive(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function ProductShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const { lang, setLang, t } = useProductLanguage();
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);

  useEffect(() => {
    setSidebarCollapsed(localStorage.getItem("xjtlu-sidebar-collapsed") === "true");
  }, []);

  useEffect(() => {
    const handleShortcut = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "b") {
        event.preventDefault();
        setSidebarCollapsed((value) => {
          localStorage.setItem("xjtlu-sidebar-collapsed", String(!value));
          return !value;
        });
      }
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        openSearch();
      }
    };
    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, [pathname, router]);

  function openSearch() {
    if (pathname === "/") return window.dispatchEvent(new Event("xjtlu-focus-chat"));
    router.push("/?focus=chat");
  }

  const toggleSidebar = () => setSidebarCollapsed((value) => {
    localStorage.setItem("xjtlu-sidebar-collapsed", String(!value));
    return !value;
  });

  return <div className="productShell" data-product-shell data-sidebar-collapsed={sidebarCollapsed} data-lang={lang}>
    <aside className="productSidebar">
      <Link href="/" className="productBrand" aria-label={t("返回 we know", "Back to we know")}>
        <span className="productBrandMark">we</span>
        <span className="productBrandCopy"><strong>we know</strong><small>{t("XJTLU 校园知识助手", "XJTLU campus knowledge")}</small></span>
      </Link>

      <Link href="/" className="productNewChat" aria-label={t("新建对话", "New chat")} title={sidebarCollapsed ? t("新建对话", "New chat") : undefined}><ProductIcon name="plus" /><span>{t("新建对话", "New chat")}</span></Link>

      <button type="button" className="productSearchButton" onClick={openSearch}>
        <ProductIcon name="search" /><span>{t("搜索", "Search")}</span><kbd>Ctrl K</kbd>
      </button>

      <nav className="productNav" aria-label={t("主要导航", "Main navigation")}>
        {NAV_ITEMS.map((item) => <Link key={item.href} href={item.href} aria-label={lang === "en" ? item.en : item.zh} title={sidebarCollapsed ? (lang === "en" ? item.en : item.zh) : undefined} className={isActive(pathname, item.href) ? "active" : undefined}>
          <span className="productNavIcon"><ProductIcon name={item.icon} /></span>
          <span>{lang === "en" ? item.en : item.zh}</span>
        </Link>)}
      </nav>

    </aside>

    <section className="productStage">
      <header className="productTopbar">
        <div className="productTopbarLead">
          <button type="button" className="productSidebarToggle" onClick={toggleSidebar} aria-label={sidebarCollapsed ? t("展开侧栏", "Expand sidebar") : t("收起侧栏", "Collapse sidebar")} aria-expanded={!sidebarCollapsed} title={`${sidebarCollapsed ? t("展开侧栏", "Expand sidebar") : t("收起侧栏", "Collapse sidebar")} (Ctrl+B)`}><ProductIcon name="panel-left" /><span className="sidebarToggleArrow" aria-hidden="true">{sidebarCollapsed ? "›" : "‹"}</span></button>
          <Link href="/history" className="productHistoryLink"><ProductIcon name="history" />{t("对话历史", "Chat history")}</Link>
        </div>
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
