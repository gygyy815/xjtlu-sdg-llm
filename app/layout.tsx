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
import "./friendly-green-v4.css";
import "./friendly-green-v5.css";
import "./friendly-green-v6.css";
import "../components/KnowledgeGraphCard.css";
import "./friendly-green-v7.css";
import "./friendly-green-v8.css";
import "./friendly-green-v9.css";
import "./sidebar-final.css";
import "./consumer-ui-final.css";
import "./consumer-ui-fixes.css";
import "./final-consistency.css";
import { UiLanguageToggle } from "@/components/UiLanguageToggle";
import { FriendlyUiController } from "@/components/FriendlyUiController";
import { ConsumerRouteFrame } from "@/components/ConsumerRouteFrame";

export const metadata = { title: "XJTLU Campus Knowledge Assistant", description: "SURF-2026-0395 knowledge-base demo" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>
    <ConsumerRouteFrame>{children}</ConsumerRouteFrame>
    <FriendlyUiController />
    <UiLanguageToggle />
  </body></html>;
}
