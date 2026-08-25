"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { useProductLanguage } from "@/lib/product-language";

const NAV_ITEMS = [
  { href: "/", zh: "新建对话", en: "New chat", icon: "＋" },
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

function pageTitle(pathname: string, zh: boolean) {
  if (pathname.startsWith("/history")) return zh ? "对话历史" : "Chat history";
  if (pathname.startsWith("/articles")) return zh ? "浏览知识" : "Browse knowledge";
  if (pathname.startsWith("/feedback")) return zh ? "反馈与建议" : "Feedback";
  if (pathname.startsWith("/agent-settings")) return zh ? "Agent 设置" : "Agent Settings";
  if (pathname.startsWith("/settings")) return zh ? "设置" : "Settings";
  if (pathname.startsWith("/tools/mind-map")) return zh ? "思维导图" : "Mind map";
  if (pathname.startsWith("/tools/ppt")) return zh ? "PPT 制作" : "PPT builder";
  if (pathname.startsWith("/tools")) return zh ? "技能工具" : "Skill tools";
  return zh ? "校园知识助手" : "Campus Knowledge Assistant";
}

export function ProductShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const { lang, setLang, t } = useProductLanguage();
  const zh = lang === "zh";

  return <div className="productShell" data-product-shell>
    <aside className="productSidebar">
      <Link href="/" className="productBrand" aria-label={t("返回校园知识助手", "Back to campus knowledge assistant")}>
        <span className="productBrandMark">XJ</span>
        <span className="productBrandCopy"><strong>XJTLU</strong><small>{t("校园知识助手", "Campus Knowledge Assistant")}</small></span>
      </Link>

      <nav className="productNav" aria-label={t("主要导航", "Main navigation")}>
        {NAV_ITEMS.map((item) => <Link key={item.href} href={item.href} className={isActive(pathname, item.href) ? "active" : undefined}>
          <span className="productNavIcon" aria-hidden="true">{item.icon}</span>
          <span>{lang === "en" ? item.en : item.zh}</span>
        </Link>)}
      </nav>

      <div className="productSidebarFoot">
        <span>{t("知识来源", "Knowledge source")}</span>
        <strong>AnythingLLM</strong>
        <small>{t("回答以当前选择的知识库为依据", "Answers use the currently selected knowledge base")}</small>
      </div>
    </aside>

    <section className="productStage">
      <header className="productTopbar">
        <div className="productTopbarTitle"><strong>{pageTitle(pathname, zh)}</strong><small>XJTLU Campus Knowledge</small></div>
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
