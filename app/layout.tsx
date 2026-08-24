import "./globals.css";
import "./skill-dashboard.css";
import "./demo-overrides.css";
import "./skill-scroll.css";
import "./responsive-hotfix.css";
import "./visual-polish.css";
import "./evidence-ui-polish.css";
import "./friendly-green.css";
import "./friendly-green-v2.css";
import "./friendly-green-v3.css";
import "../components/KnowledgeGraphCard.css";
import { UiLanguageToggle } from "@/components/UiLanguageToggle";
import { EvaluationShortcut } from "@/components/EvaluationShortcut";

export const metadata = { title: "XJTLU Campus Knowledge Assistant", description: "SURF-2026-0395 knowledge-base demo" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>
    <script dangerouslySetInnerHTML={{ __html: "try{if(!localStorage.getItem('xjtlu-ui-v3-skill-migrated')){localStorage.setItem('xjtlu-skill-rail-collapsed','1');localStorage.setItem('xjtlu-ui-v3-skill-migrated','1')}}catch(e){}" }} />
    {children}<EvaluationShortcut /><UiLanguageToggle />
  </body></html>;
}
