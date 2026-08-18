import { NextResponse } from "next/server";
import { listAnythingLLMWorkspaces, workspaceMap } from "@/lib/anythingllm";

export async function GET() {
  const configured = workspaceMap();
  try {
    const live = await listAnythingLLMWorkspaces();
    const liveBySlug = new Map(live.map((item) => [item.slug, item]));
    const configuredEntries = Object.entries(configured);

    // If the user explicitly configured workspace mappings, the Demo selector
    // should show only those approved workspaces that still exist in the
    // currently connected AnythingLLM instance. Do not automatically expose
    // every live AnythingLLM workspace, because restored/test workspaces can
    // otherwise reappear in the UI unexpectedly.
    const workspaces = configuredEntries.length
      ? configuredEntries
          .filter(([, slug]) => liveBySlug.has(slug))
          .map(([label, slug]) => ({
            label,
            slug,
            name: liveBySlug.get(slug)?.name || label,
          }))
      : live.map((item) => ({
          label: item.name || item.slug,
          slug: item.slug,
          name: item.name || item.slug,
        }));

    const configuredSlugs = new Set(configuredEntries.map(([, slug]) => slug));
    const discovered = live
      .filter((item) => !configuredSlugs.has(item.slug))
      .map((item) => ({ label: item.name || item.slug, slug: item.slug, name: item.name || item.slug }));

    return NextResponse.json({
      accounts: workspaces.map((item) => item.label),
      workspaces,
      source: configuredEntries.length ? "configured-live" : "live",
      staleConfigured: configuredEntries
        .filter(([, slug]) => !liveBySlug.has(slug))
        .map(([label, slug]) => ({ label, slug })),
      discoveredAvailable: discovered,
    });
  } catch (error) {
    const workspaces = Object.entries(configured).map(([label, slug]) => ({ label, slug, name: label }));
    return NextResponse.json({
      accounts: workspaces.map((item) => item.label),
      workspaces,
      source: "env-fallback",
      warning: error instanceof Error ? error.message : "无法读取 AnythingLLM 当前 Workspace，已回退到 .env.local 配置。",
    });
  }
}
