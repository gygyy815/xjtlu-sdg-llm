import { NextResponse } from "next/server";
import { listAnythingLLMWorkspaces, workspaceMap } from "@/lib/anythingllm";
import { canonicalWorkspaceLabel } from "@/lib/workspace-display";

export async function GET() {
  const configured = workspaceMap();
  try {
    const live = await listAnythingLLMWorkspaces();
    const configuredEntries = Object.entries(configured);
    const configuredLabelBySlug = new Map(configuredEntries.map(([label, slug]) => [slug, label]));
    const configuredSlugs = new Set(configuredEntries.map(([, slug]) => slug));
    const liveSlugs = new Set(live.map((item) => item.slug));

    // The Demo should expose only managed campus knowledge bases, never internal
    // AnythingLLM workspaces such as Assistant Chats.
    const visibleLive = live.filter((item) =>
      item.slug !== "assistant-chats" &&
      (
        item.slug === "xjtlu-all-sources" ||
        item.slug.startsWith("xjtlu-source-") ||
        configuredSlugs.has(item.slug)
      )
    );

    const workspaces = visibleLive
      .map((item) => {
        const rawLabel = configuredLabelBySlug.get(item.slug) || item.name || item.slug;
        return {
          label: canonicalWorkspaceLabel(rawLabel),
          slug: item.slug,
          name: canonicalWorkspaceLabel(item.name || rawLabel),
        };
      })
      .sort((left, right) => {
        if (left.slug === "xjtlu-all-sources") return -1;
        if (right.slug === "xjtlu-all-sources") return 1;
        return left.label.localeCompare(right.label, "zh-CN");
      });

    const discovered = visibleLive
      .filter((item) => !configuredSlugs.has(item.slug))
      .map((item) => ({
        label: canonicalWorkspaceLabel(item.name || item.slug),
        slug: item.slug,
        name: canonicalWorkspaceLabel(item.name || item.slug),
      }));

    return NextResponse.json({
      accounts: workspaces.map((item) => item.label),
      workspaces,
      source: configuredEntries.length ? "managed-live-with-configured-labels" : "managed-live",
      staleConfigured: configuredEntries
        .filter(([, slug]) => !liveSlugs.has(slug))
        .map(([label, slug]) => ({ label: canonicalWorkspaceLabel(label), slug })),
      discoveredAvailable: discovered,
    });
  } catch (error) {
    const workspaces = Object.entries(configured)
      .filter(([, slug]) => slug !== "assistant-chats")
      .map(([label, slug]) => ({
        label: canonicalWorkspaceLabel(label),
        slug,
        name: canonicalWorkspaceLabel(label),
      }));
    return NextResponse.json({
      accounts: workspaces.map((item) => item.label),
      workspaces,
      source: "env-fallback",
      warning: error instanceof Error ? error.message : "无法读取 AnythingLLM 当前 Workspace，已回退到 .env.local 配置。",
    });
  }
}
