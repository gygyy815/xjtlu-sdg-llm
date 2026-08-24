import { NextResponse } from "next/server";
import { AnythingLLMError, askAnythingLLM, resolveWorkspaceSlug } from "@/lib/anythingllm";
import { enhancedVectorSearch, mergeGroundingCitations, retrievalPromptHint } from "@/lib/retrieval-v24";
import { composeEvidenceBundle, EVIDENCE_COMPOSER_VERSION } from "@/lib/evidence-composer-v12";
import { answerSynthesisInstruction, ANSWER_SYNTHESIS_VERSION } from "@/lib/answer-synthesis";
import { answerLanguageInstruction, detectAnswerLanguage } from "@/lib/answer-language";
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

function isTransient(error: unknown) {
  return error instanceof AnythingLLMError && (error.status >= 500 || /connection|timeout|upstream/i.test(error.message));
}

export async function POST(request: Request) {
  try {
    const { message, account, workspaceSlug, sessionId, skillId, agentMode } = await request.json();
    const slug = resolveWorkspaceSlug(account, workspaceSlug);
    if (!message?.trim()) return NextResponse.json({ error: "请输入问题。" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "当前知识库没有可用的 AnythingLLM Workspace。" }, { status: 400 });

    const userMessage = String(message).trim();
    const answerLanguage = detectAnswerLanguage(userMessage);
    const languageInstruction = answerLanguageInstruction(userMessage);
    const builtIn = getSkill(skillId);
    const custom = builtIn ? null : activeCustomSkill(request);
    const guard = temporalGuard(userMessage, skillId);

    const retrieval = await enhancedVectorSearch(slug, userMessage, { threshold: 0.2 });
    const retrievalHint = retrievalPromptHint(retrieval.plan, retrieval.results);
    const evidence = await composeEvidenceBundle(slug, userMessage, retrieval.plan, retrieval.results);
    const synthesis = answerSynthesisInstruction(userMessage, retrieval.plan.intent);

    const skillPrompt = builtIn?.prompt
      ? `\n[技能：${builtIn.name}]\n${builtIn.prompt}\n`
      : custom
        ? `\n[自定义技能：${custom.name}]\n${custom.prompt}\n`
        : "";

    let task: string;
    let compactTask: string | undefined;
    let answerMode: "query" | "chat";

    if (agentMode) {
      const baseTask = `${guard}${retrievalHint}${languageInstruction}${skillPrompt}\n[用户问题]\n${userMessage}`;
      task = `@agent ${baseTask}`;
      answerMode = "query";
    } else {
      task = `${guard}${evidence.prompt}${synthesis}${languageInstruction}${skillPrompt}\n[用户问题]\n${userMessage}\n\n[最终作答]\n只依据上方证据槽位回答；缺失字段明确写“文档未明确说明”。`;
      compactTask = `${guard}${evidence.compactPrompt}${synthesis}${languageInstruction}${skillPrompt}\n[用户问题]\n${userMessage}\n\n[最终作答]\n只依据上方精简证据槽位回答。`;
      answerMode = "chat";
    }

    let result;
    let compactFallbackUsed = false;
    try {
      result = await askAnythingLLM(slug, task, answerMode, sessionId);
    } catch (error) {
      if (!agentMode && compactTask && isTransient(error)) {
        compactFallbackUsed = true;
        result = await askAnythingLLM(slug, compactTask, "chat", sessionId);
      } else {
        throw error;
      }
    }

    const groundingResults = !agentMode && evidence.citations.length ? evidence.citations : retrieval.results;
    const citations = mergeGroundingCitations(result.citations || [], retrieval.plan, groundingResults);
    const groundingPayload = agentMode ? null : {
      version: EVIDENCE_COMPOSER_VERSION,
      answerSynthesisVersion: ANSWER_SYNTHESIS_VERSION,
      answerMode,
      slots: evidence.slots,
      citationCount: evidence.citations.length,
      compactFallbackUsed,
      warning: evidence.warning,
    };

    return NextResponse.json({
      ...result,
      citations,
      answerLanguage,
      activeSkill: builtIn?.name || custom?.name || null,
      skillSource: builtIn ? "builtin" : custom ? "custom" : null,
      temporalGuardApplied: Boolean(guard),
      grounding: groundingPayload,
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
        frozenVersion: 2.5,
        grounding: groundingPayload,
      },
    });
  } catch (error) {
    const status = error instanceof AnythingLLMError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "请求失败。" }, { status });
  }
}
