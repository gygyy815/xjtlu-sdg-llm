"use client";

import type { ReactNode } from "react";

/**
 * Compatibility shim.
 *
 * The clean UI reset moved the user-facing shell to ConsumerRouteFrame so every
 * user route shares exactly one sidebar/topbar. Older pages may still import
 * UserPageShell; returning children here prevents nested or mismatched shells.
 */
export function UserPageShell({ children }: { children: ReactNode }) {
  return <>{children}</>;
}
