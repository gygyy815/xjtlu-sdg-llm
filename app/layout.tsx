import "./globals.css";
import "../components/KnowledgeGraphCard.css";
import "./product-system.css";
import { ConsumerRouteFrame } from "@/components/ConsumerRouteFrame";
import { ProductLanguageProvider } from "@/lib/product-language";

export const metadata = {
  title: "we know — XJTLU Campus Knowledge",
  description: "SURF-2026-0395 knowledge-base demo",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>
    <ProductLanguageProvider>
      <ConsumerRouteFrame>{children}</ConsumerRouteFrame>
    </ProductLanguageProvider>
  </body></html>;
}
