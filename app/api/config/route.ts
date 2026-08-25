import { NextResponse } from "next/server";
import { listAnythingLLMWorkspaces, workspaceMap } from "@/lib/anythingllm";

export async function GET() {
  const configured = workspaceMap();
  try {
    const live = await listAnythingLLMWorkspaces();
    const configuredEntries = Object.entries(configured);
    const configuredLabelBySlug = new Map(configuredEntries.map(([label, slug]) => [slug, label]));
    const configuredSlugs = new Set(configuredEntries.map(([, slug]) => slug));
    const liveSlugs = new Set(live.map((item) => item.slug));

    // The Demo should expose only the managed campus knowledge bases, not every
    // internal AnythingLLM workspace. New source workspaces created by the sync
    // pipeline use xjtlu-source-*; legacy mapped workspaces remain available via
    // ANYTHINGLLM_WORKSPACES; xjtlu-all-sources is the cross-source workspace.
    const visibleLive = live.filter((item) =>
      item.slug !== "assistant-chats" &&
      (
        item.slug === "xjtlu-all-sources" ||
        item.slug.startsWith("xjtlu-source-") ||
        configuredSlugs.has(item.slug)
      )
    );

    const workspaces = visibleLive
      .map((item) => ({
        label: configuredLabelBySlug.get(item.slug) || item.name || item.slug,
        slug: item.slug,
        name: item.name || item.slug,
      }))
      .sort((left, right) => {
        if (left.slug === "xjtlu-all-sources") return -1;
        if (right.slug === "xjtlu-all-sources") return 1;
        return left.label.localeCompare(right.label, "zh-CN");
      });

    const discovered = visibleLive
      .filter((item) => !configuredSlugs.has(item.slug))
      .map((item) => ({ label: item.name || item.slug, slug: item.slug, name: item.name || item.slug }));

    return NextResponse.json({
      accounts: workspaces.map((item) => item.label),
      workspaces,
      source: configuredEntries.length ? "managed-live-with-configured-labels" : "managed-live",
      staleConfigured: configuredEntries
        .filter(([, slug]) => !liveSlugs.has(slug))
        .map(([label, slug]) => ({ label, slug })),
      discoveredAvailable: discovered,
    });
  } catch (error) {
    const workspaces = Object.entries(configured)
      .filter(([, slug]) => slug !== "assistant-chats")
      .map(([label, slug]) => ({ label, slug, name: label }));
    return NextResponse.json({
      accounts: workspaces.map((item) => item.label),
      workspaces,
      source: "env-fallback",
      warning: error instanceof Error ? error.message : "无法读取 AnythingLLM 当前 Workspace，已回退到 .env.local 配置。",
    });
  }
}
