"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { UserPageShell } from "@/components/UserPageShell";

const FRAMED_PREFIXES = ["/articles", "/history", "/feedback", "/settings", "/tools"];

export function ConsumerRouteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const shouldFrame = FRAMED_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return shouldFrame ? <UserPageShell>{children}</UserPageShell> : <>{children}</>;
}
