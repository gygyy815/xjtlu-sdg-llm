"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { ReactNode } from "react";

const NAV_ITEMS = [
  { href: "/", label: "新建对话", icon: "◉" },
  { href: "/history", label: "对话历史", icon: "◷" },
  { href: "/articles", label: "浏览知识", icon: "▤" },
  { href: "/feedback", label: "反馈与建议", icon: "◇" },
  { href: "/agent-settings", label: "Agent 设置", icon: "✦" },
  { href: "/settings", label: "设置", icon: "⚙" },
] as const;

function activePath(pathname: string, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || pathname.startsWith(`${href}/`);
}

export function UserPageShell({ children }: { children: ReactNode }) {
  const pathname = usePathname();

  return <main className="consumerShell">
    <aside className="consumerSidebar">
      <Link href="/" className="consumerBrand" aria-label="返回校园知识助手">
        <span className="consumerBrandMark">XJ</span>
        <span><strong>XJTLU</strong><small>校园知识助手</small></span>
      </Link>

      <nav className="consumerNav" aria-label="主要导航">
        {NAV_ITEMS.map((item) => <Link
          key={item.href}
          href={item.href}
          className={activePath(pathname, item.href) ? "active" : undefined}
        >
          <span aria-hidden="true">{item.icon}</span>
          <b>{item.label}</b>
        </Link>)}
      </nav>

      <div className="consumerSidebarNote">
        <span>知识来源</span>
        <strong>AnythingLLM</strong>
        <small>回答以当前所选知识库为依据</small>
      </div>
    </aside>

    <section className="consumerStage">
      <header className="consumerTopbar">
        <div><strong>XJTLU Campus Knowledge</strong><small>Information Assistant</small></div>
        <Link href="/">返回问答</Link>
      </header>
      <div className="consumerContent">{children}</div>
    </section>
  </main>;
}
