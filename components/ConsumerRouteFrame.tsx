"use client";

import { usePathname } from "next/navigation";
import type { ReactNode } from "react";
import { ProductShell } from "@/components/ProductShell";

const INTERNAL_PREFIXES = ["/admin", "/evaluation", "/api"];

export function ConsumerRouteFrame({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const internal = INTERNAL_PREFIXES.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));
  return internal ? <>{children}</> : <ProductShell>{children}</ProductShell>;
}
