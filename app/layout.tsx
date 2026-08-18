import "./globals.css";
import "./skill-dashboard.css";
import "./demo-overrides.css";
import "./skill-scroll.css";
import "../components/KnowledgeGraphCard.css";
import { UiLanguageToggle } from "@/components/UiLanguageToggle";

export const metadata = { title: "XJTLU Campus Knowledge Assistant", description: "SURF-2026-0395 knowledge-base demo" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}<UiLanguageToggle /></body></html>;
}
