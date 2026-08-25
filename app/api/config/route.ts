import { NextResponse } from "next/server";
import { listAnythingLLMWorkspaces, workspaceMap } from "@/lib/anythingllm";

export async function GET() {
  const configured = workspaceMap();
  try {
    const live = await listAnythingLLMWorkspaces();
    const configuredEntries = Object.entries(configured);
    const configuredLabelBySlug = new Map(configuredEntries.map(([label, slug]) => [slug, label]));
    const liveSlugs = new Set(live.map((item) => item.slug));

    // User-facing selectors should expose the currently reachable AnythingLLM
    // workspaces, even when ANYTHINGLLM_WORKSPACES still contains stale labels
    // from an older/restored installation. Configured labels are retained when
    // they still point to a live slug, but they no longer hide other live
    // workspaces. This keeps large restored instances usable from the Demo.
    const workspaces = live.map((item) => ({
      label: configuredLabelBySlug.get(item.slug) || item.name || item.slug,
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
      source: configuredEntries.length ? "live-with-configured-labels" : "live",
      staleConfigured: configuredEntries
        .filter(([, slug]) => !liveSlugs.has(slug))
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
