"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import { useProductLanguage } from "@/lib/product-language";

const NAV_ITEMS = [
  { href: "/", zh: "问助手", en: "Ask AI", icon: "message" },
  { href: "/articles", zh: "浏览知识", en: "Browse knowledge", icon: "library" },
  { href: "/feedback", zh: "反馈与建议", en: "Feedback", icon: "feedback" },
] as const;

type ProductIconName = typeof NAV_ITEMS[number]["icon"] | "plus" | "search" | "history" | "panel-left";

function ProductIcon({ name }: { name: ProductIconName }) {
  const paths: Record<ProductIconName, ReactNode> = {
    message: <><path d="M21 15a4 4 0 0 1-4 4H8l-5 3V7a4 4 0 0 1 4-4h10a4 4 0 0 1 4 4z"/><path d="M8 9h8M8 13h5"/></>,
    library: <><path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20"/><path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z"/><path d="M8 7h8M8 11h6"/></>,
    feedback: <><path d="M21 11.5a8.4 8.4 0 0 1-9 8.5 9.8 9.8 0 0 1-4-.8L3 21l1.7-4.2A8.5 8.5 0 1 1 21 11.5z"/><path d="M8 12h.01M12 12h.01M16 12h.01"/></>,
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
