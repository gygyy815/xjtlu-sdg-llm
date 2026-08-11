import "./globals.css";

export const metadata = { title: "XJTLU Campus Knowledge Assistant", description: "SURF-2026-0395 knowledge-base demo" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="zh-CN"><body>{children}</body></html>;
}
