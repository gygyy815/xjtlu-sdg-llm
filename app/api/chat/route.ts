import { NextResponse } from "next/server";
import { AnythingLLMError, askAnythingLLM, resolveWorkspaceSlug } from "@/lib/anythingllm";
import { enhancedVectorSearch, mergeGroundingCitations, retrievalPromptHint } from "@/lib/retrieval";
import { getSkill } from "@/lib/skills/registry";
import { temporalGuard } from "@/lib/temporal-guard";

function activeCustomSkill(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const raw = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("xjtlu_active_custom_skill="))?.split("=").slice(1).join("=");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!parsed?.name || !parsed?.prompt) return null;
    return { name: String(parsed.name).slice(0, 80), prompt: String(parsed.prompt).slice(0, 2600) };
  } catch {
    return null;
  }
}

export async function POST(request: Request) {
  try {
    const { message, account, workspaceSlug, sessionId, skillId, agentMode } = await request.json();
    const slug = resolveWorkspaceSlug(account, workspaceSlug);
    if (!message?.trim()) return NextResponse.json({ error: "请输入问题。" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "当前知识库没有可用的 AnythingLLM Workspace。" }, { status: 400 });

    const userMessage = String(message).trim();
    const builtIn = getSkill(skillId);
    const custom = builtIn ? null : activeCustomSkill(request);
    const guard = temporalGuard(userMessage, skillId);

    const retrieval = await enhancedVectorSearch(slug, userMessage, { threshold: 0.2 });
    const retrievalHint = retrievalPromptHint(retrieval.plan, retrieval.results);

    const baseTask = builtIn?.prompt
      ? `${guard}${retrievalHint}\n[技能：${builtIn.name}]\n${builtIn.prompt}\n\n[用户问题]\n${userMessage}`
      : custom
        ? `${guard}${retrievalHint}\n[自定义技能：${custom.name}]\n${custom.prompt}\n\n[用户问题]\n${userMessage}`
        : guard || retrievalHint
          ? `${guard}${retrievalHint}\n[用户问题]\n${userMessage}`
          : userMessage;
    const task = agentMode ? `@agent ${baseTask}` : baseTask;

    const result = await askAnythingLLM(slug, task, "query", sessionId);
    const citations = mergeGroundingCitations(result.citations || [], retrieval.plan, retrieval.results);

    return NextResponse.json({
      ...result,
      citations,
      activeSkill: builtIn?.name || custom?.name || null,
      skillSource: builtIn ? "builtin" : custom ? "custom" : null,
      temporalGuardApplied: Boolean(guard),
      retrieval: {
        query: userMessage,
        workspace: slug,
        topN: retrieval.plan.topN,
        threshold: retrieval.plan.threshold,
        intent: retrieval.plan.intent,
        sourceHint: retrieval.plan.sourceHint,
        queries: retrieval.plan.queries,
        retrievedCount: retrieval.results.length,
        usedCount: citations.length,
        results: retrieval.results,
        warning: retrieval.warning,
      },
    });
  } catch (error) {
    const status = error instanceof AnythingLLMError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "请求失败。" }, { status });
  }
}
