"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";
import type { UiLang } from "@/lib/ui-i18n";

const NAV_ITEMS = [
  { href: "/", zh: "新建对话", en: "New chat", icon: "◉" },
  { href: "/history", zh: "对话历史", en: "Chat history", icon: "◷" },
  { href: "/articles", zh: "浏览知识", en: "Browse knowledge", icon: "▤" },
  { href: "/feedback", zh: "反馈与建议", en: "Feedback", icon: "◇" },
  { href: "/agent-settings", zh: "Agent 设置", en: "Agent Settings", icon: "✦" },
  { href: "/settings", zh: "设置", en: "Settings", icon: "⚙" },
] as const;

function activePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function UserPageShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const [lang, setLang] = useState<UiLang>("zh");

  useEffect(() => {
    const read = () => setLang(localStorage.getItem("xjtlu-ui-language") === "en" ? "en" : "zh");
    read();
    const onLanguage = (event: Event) => {
      setLang((event as CustomEvent<{ lang?: UiLang }>).detail?.lang === "en" ? "en" : "zh");
    };
    window.addEventListener("xjtlu-ui-language-change", onLanguage);
    window.addEventListener("storage", read);
    return () => {
      window.removeEventListener("xjtlu-ui-language-change", onLanguage);
      window.removeEventListener("storage", read);
    };
  }, []);

  const t = (zh: string, en: string) => lang === "en" ? en : zh;

  return <div className="consumerShell">
    <aside className="consumerSidebar" data-no-ui-translate>
      <Link href="/" className="consumerBrand" aria-label={t("返回校园知识助手", "Back to campus knowledge assistant")}>
        <span className="consumerBrandMark">XJ</span>
        <span><strong>XJTLU</strong><small>{t("校园知识助手", "Campus Knowledge Assistant")}</small></span>
      </Link>

      <nav className="consumerNav" aria-label={t("主要导航", "Main navigation")}>
        {NAV_ITEMS.map((item) => <Link
          key={item.href}
          href={item.href}
          className={activePath(pathname, item.href) ? "active" : undefined}
        >
          <span aria-hidden="true">{item.icon}</span>
          <b>{lang === "en" ? item.en : item.zh}</b>
        </Link>)}
      </nav>

      <div className="consumerSidebarNote">
        <span>{t("知识来源", "Knowledge source")}</span>
        <strong>AnythingLLM</strong>
        <small>{t("回答以当前所选知识库为依据", "Answers use the currently selected knowledge base")}</small>
      </div>
    </aside>

    <section className="consumerStage">
      <header className="consumerTopbar" data-no-ui-translate>
        <div><strong>XJTLU Campus Knowledge</strong><small>Information Assistant</small></div>
        <Link href="/">{t("返回问答", "Back to chat")}</Link>
      </header>
      <div className="consumerContent">{children}</div>
    </section>
  </div>;
}
