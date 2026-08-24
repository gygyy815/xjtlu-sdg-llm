import "./globals.css";
import "./skill-dashboard.css";
import "./demo-overrides.css";
import "./skill-scroll.css";
import "./responsive-hotfix.css";
import "./visual-polish.css";
import "./evidence-ui-polish.css";
import "./friendly-green.css";
import "../components/KnowledgeGraphCard.css";
import { UiLanguageToggle } from "@/components/UiLanguageToggle";
import { EvaluationShortcut } from "@/components/EvaluationShortcut";

export const metadata = { title: "XJTLU Campus Knowledge Assistant", description: "SURF-2026-0395 knowledge-base demo" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}<EvaluationShortcut /><UiLanguageToggle /></body></html>;
}
