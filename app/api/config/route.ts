import { NextResponse } from "next/server";
import { listAnythingLLMWorkspaces, workspaceMap } from "@/lib/anythingllm";

export async function GET() {
  const configured = workspaceMap();
  try {
    const live = await listAnythingLLMWorkspaces();
    const liveBySlug = new Map(live.map((item) => [item.slug, item]));
    const configuredSlugs = new Set(Object.values(configured));

    const preferred = Object.entries(configured)
      .filter(([, slug]) => liveBySlug.has(slug))
      .map(([label, slug]) => ({
        label,
        slug,
        name: liveBySlug.get(slug)?.name || label,
      }));

    const discovered = live
      .filter((item) => !configuredSlugs.has(item.slug))
      .map((item) => ({ label: item.name || item.slug, slug: item.slug, name: item.name || item.slug }));

    const workspaces = [...preferred, ...discovered];
    return NextResponse.json({
      accounts: workspaces.map((item) => item.label),
      workspaces,
      source: "live",
      staleConfigured: Object.entries(configured)
        .filter(([, slug]) => !liveBySlug.has(slug))
        .map(([label, slug]) => ({ label, slug })),
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
