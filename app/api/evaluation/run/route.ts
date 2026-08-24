import { NextResponse } from "next/server";
import { AnythingLLMError, askAnythingLLM } from "@/lib/anythingllm";
import { enhancedVectorSearch, mergeGroundingCitations, RETRIEVAL_VERSION } from "@/lib/retrieval-v24";
import { composeEvidenceBundle, EVIDENCE_COMPOSER_VERSION } from "@/lib/evidence-composer";
import { answerSynthesisInstruction, ANSWER_SYNTHESIS_VERSION, isDerivedClassificationQuestion } from "@/lib/answer-synthesis";
import { applyTemporalGuard } from "@/lib/temporal-guard";

type SourceMatchMode = "all" | "any";

type EvalRequest = {
  question?: string;
  workspaceSlug?: string;
  expectedSourceTerms?: string[];
  expectedAnswerTerms?: string[];
  expectedDate?: string;
  expectAbstain?: boolean;
  sourceMatchMode?: SourceMatchMode;
};

const EMPTY_MARKERS = new Set(["", "留空", "未定义", "n/a", "na", "none", "null", "undefined"]);
const LABEL_ONLY_MARKERS = new Set(["期望来源", "expected sources", "expected source", "期望事实", "expected facts", "expected answers", "expected answer"]);

function cleanTerms(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => String(item || "").trim())
        .filter((item) => !EMPTY_MARKERS.has(item.toLocaleLowerCase()))
        .filter((item) => !LABEL_ONLY_MARKERS.has(item.replace(/[：:]$/, "").trim().toLocaleLowerCase()))
        .slice(0, 16)
    : [];
}

function cleanOptionalText(value: unknown) {
  const text = String(value || "").trim();
  return EMPTY_MARKERS.has(text.toLocaleLowerCase()) ? "" : text;
}

function normalize(value: string) {
  return value
    .normalize("NFKC")
    .toLocaleLowerCase()
    .replace(/\.md\b/g, "")
    .replace(/[\s_—–\-，。；：、！？【】（）()\[\]{}<>“”‘’'"`]+/g, "");
}

function includesTerm(haystack: string, term: string) {
  const rawHaystack = haystack.toLocaleLowerCase();
  const rawTerm = term.toLocaleLowerCase();
  return rawHaystack.includes(rawTerm) || normalize(haystack).includes(normalize(term));
}

function aliases(group: string) {
  return group.split(/\s*\|\|\s*/).map((item) => item.trim()).filter(Boolean);
}

function groupMatches(haystack: string, group: string) {
  return aliases(group).some((term) => includesTerm(haystack, term));
}

function groupCoverage(haystack: string, groups: string[]) {
  if (!groups.length) return { hit: null as boolean | null, matched: 0, total: 0, coverage: null as number | null };
  const matched = groups.filter((group) => groupMatches(haystack, group)).length;
  return {
    hit: matched === groups.length,
    matched,
    total: groups.length,
    coverage: Number(((matched / groups.length) * 100).toFixed(1)),
  };
}

function groundedGroupCoverage(answer: string, evidenceCorpus: string, groups: string[]) {
  if (!groups.length) return { hit: null as boolean | null, matched: 0, total: 0, coverage: null as number | null };
  const matched = groups.filter((group) => groupMatches(answer, group) && groupMatches(evidenceCorpus, group)).length;
  return {
    hit: matched === groups.length,
    matched,
    total: groups.length,
    coverage: Number(((matched / groups.length) * 100).toFixed(1)),
  };
}

function positiveClassificationCorpus(answer: string) {
  const negative = /(未明确|没有明确|没有相关|无相关|不相关|无法判断|不能判断|not\s+(?:clearly\s+)?related|no\s+clear|not\s+supported|insufficient\s+evidence)/i;
  return answer
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean)
    .filter((line) => !negative.test(line))
    .join("\n");
}

function evidenceFactCorpus(prompt: string) {
  const marker = "[证据槽位：";
  const start = prompt.indexOf(marker);
  if (start < 0) return "";
  return prompt
    .slice(start)
    .split(/\n(?=\[证据槽位：)/g)
    .map((block) => block.trim())
    .filter(Boolean)
    .filter((block) => !block.includes("未检索到足以支持该槽位的正文证据。"))
    .map((block) => block.replace(/^\[证据槽位：[^\]]+\]\s*/i, ""))
    .join("\n\n");
}

function sourceCoverage(haystack: string, groups: string[], mode: SourceMatchMode) {
  if (!groups.length) return { hit: null as boolean | null, matched: 0, total: 0, coverage: null as number | null };
  const matched = groups.filter((group) => groupMatches(haystack, group)).length;
  return {
    hit: mode === "any" ? matched > 0 : matched === groups.length,
    matched,
    total: groups.length,
    coverage: Number(((matched / groups.length) * 100).toFixed(1)),
  };
}

function sourceText(source: { title?: string; source?: string; text?: string; url?: string }) {
  return [source.title, source.source, source.text, source.url].filter(Boolean).join("\n");
}

function abstained(answer: string) {
  return /(未找到|没有找到|无法确认|不能确认|文档未明确|没有明确证据|暂无明确|没有提及|未提及|未提供|没有相关信息|知识库中没有|当前知识库中没有|not found|cannot confirm|unable to confirm|not explicitly stated|insufficient evidence|no clear evidence|not mentioned|does not mention|no relevant information|not provided)/i.test(answer);
}

function delay(ms: number) { return new Promise((resolve) => setTimeout(resolve, ms)); }

function isTransientAnythingLLMError(error: unknown) {
  if (error instanceof AnythingLLMError) return error.status >= 500 || /connection|timeout|temporar|upstream/i.test(error.message);
  return error instanceof Error && /connection|timeout|fetch failed|socket|network/i.test(error.message);
}

function evaluationSessionId(attempt: number) {
  return `rag-eval-${Date.now()}-${attempt}-${Math.random().toString(36).slice(2, 10)}`;
}

async function askWithRetry(workspaceSlug: string, primaryTask: string, compactFallbackTask?: string, mode = "chat") {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const sessionId = evaluationSessionId(attempt);
      const task = attempt === 2 && compactFallbackTask ? compactFallbackTask : primaryTask;
      const value = await askAnythingLLM(workspaceSlug, task, mode, sessionId);
      return { value, attempts: attempt, isolatedSession: true, compactFallbackUsed: attempt === 2 && Boolean(compactFallbackTask), mode };
    } catch (error) {
      lastError = error;
      if (attempt >= 2 || !isTransientAnythingLLMError(error)) throw error;
      await delay(800);
    }
  }
  throw lastError;
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as EvalRequest;
    const question = String(body.question || "").trim();
    const workspaceSlug = String(body.workspaceSlug || "").trim();
    const expectedSourceTerms = cleanTerms(body.expectedSourceTerms);
    const expectedAnswerTerms = cleanTerms(body.expectedAnswerTerms);
    const expectedDate = cleanOptionalText(body.expectedDate);
    const expectAbstain = Boolean(body.expectAbstain);
    const sourceMatchMode: SourceMatchMode = body.sourceMatchMode === "any" ? "any" : "all";

    if (!question) return NextResponse.json({ error: "Evaluation question is required." }, { status: 400 });
    if (!workspaceSlug) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const enhanced = await enhancedVectorSearch(workspaceSlug, question, { threshold: 0.2 });
    const retrieved = enhanced.results;
    const retrievalWarning = enhanced.warning || "";
    const evidence = await composeEvidenceBundle(workspaceSlug, question, enhanced.plan, retrieved);
    const synthesis = answerSynthesisInstruction(question, enhanced.plan.intent);

    const guarded = applyTemporalGuard(question);
    const task = `${guarded.guard}${evidence.prompt}${synthesis}\n\n[用户问题]\n${question}\n\n[最终作答]\n严格根据上方证据槽位直接回答。`;
    const compactTask = `${guarded.guard}${evidence.compactPrompt}${synthesis}\n\n[用户问题]\n${question}\n\n[最终作答]\n严格根据上方精简证据槽位直接回答。`;
    const answerRun = await askWithRetry(workspaceSlug, task, compactTask, "chat");
    const answer = answerRun.value.text || "";
    const groundingResults = evidence.citations.length ? evidence.citations : retrieved;
    const citations = mergeGroundingCitations(answerRun.value.citations || [], enhanced.plan, groundingResults);

    const retrievalCorpus = retrieved.map(sourceText).join("\n");
    const citationCorpus = citations.map(sourceText).join("\n");
    const groundingCorpus = evidenceFactCorpus(evidence.prompt);
    const classificationTask = isDerivedClassificationQuestion(question);

    const retrieval = sourceCoverage(retrievalCorpus, expectedSourceTerms, sourceMatchMode);
    const citation = sourceCoverage(citationCorpus, expectedSourceTerms, sourceMatchMode);
    const rawFacts = groupCoverage(answer, expectedAnswerTerms);
    const positiveClassificationFacts = classificationTask ? groupCoverage(positiveClassificationCorpus(answer), expectedAnswerTerms) : null;
    const evidenceMetric = classificationTask ? null : groupCoverage(groundingCorpus, expectedAnswerTerms);
    const facts = classificationTask
      ? positiveClassificationFacts!
      : groundedGroupCoverage(answer, groundingCorpus, expectedAnswerTerms);
    const dateHit = expectedDate ? includesTerm(answer, expectedDate) && includesTerm(groundingCorpus, expectedDate) : null;
    const abstentionHit = expectAbstain ? abstained(answer) : null;
    const evidenceSupportHit = classificationTask ? null : expectedAnswerTerms.length ? evidenceMetric!.hit : null;
    const unsupportedSlots = evidence.slots.filter((slot) => slot.evidenceCount === 0);
    const evidenceTermGaps = classificationTask ? [] : expectedAnswerTerms.filter((group) => !groupMatches(groundingCorpus, group));
    const temporalEvidenceGap = Boolean(guarded.guard) && retrieval.hit === true && evidenceTermGaps.length > 0;
    const textCoverageGapSuspected = unsupportedSlots.length > 0 || temporalEvidenceGap;

    const checks = [retrieval.hit, citation.hit, facts.hit, dateHit, abstentionHit, evidenceSupportHit].filter((value): value is boolean => typeof value === "boolean");
    const passedChecks = checks.filter(Boolean).length;

    return NextResponse.json({
      runStatus: "completed",
      question,
      workspaceSlug,
      answer,
      citations,
      retrieved,
      retrievalWarning: [retrievalWarning, evidence.warning].filter(Boolean).join(" | "),
      runtime: {
        answerAttempts: answerRun.attempts,
        sequentialRequests: true,
        isolatedSession: answerRun.isolatedSession,
        temporalGuardApplied: Boolean(guarded.guard),
        compactFallbackUsed: answerRun.compactFallbackUsed,
        answerMode: answerRun.mode,
        evidenceComposerVersion: EVIDENCE_COMPOSER_VERSION,
        answerSynthesisVersion: ANSWER_SYNTHESIS_VERSION,
      },
      retrievalStrategy: {
        version: RETRIEVAL_VERSION,
        intent: enhanced.plan.intent,
        sourceHint: enhanced.plan.sourceHint,
        queries: enhanced.plan.queries,
        queryCount: enhanced.plan.queries.length,
        topN: enhanced.plan.topN,
        evidenceInjected: true,
        boundedPrompt: true,
        focusedSubqueries: enhanced.plan.intent !== "single",
        documentFocusedPass: enhanced.plan.intent === "document-detail" || enhanced.plan.queries.length > 6,
        frozen: true,
      },
      grounding: {
        version: EVIDENCE_COMPOSER_VERSION,
        answerSynthesisVersion: ANSWER_SYNTHESIS_VERSION,
        answerMode: "chat",
        bypassedSecondRagDecision: true,
        slotRefinementQueries: true,
        mergedCrossSlotEvidence: true,
        slots: evidence.slots,
        unsupportedSlots,
        evidenceTermGaps,
        textCoverageGapSuspected,
        citationCount: evidence.citations.length,
      },
      evaluation: {
        version: 2.9,
        sourceMatchMode,
        aliasSyntax: "Use || inside one expected item for accepted alternatives.",
        classificationTask,
        factBasis: classificationTask
          ? "Derived classification labels count only when stated positively in the answer; source text is not required to literally contain the SDG label."
          : "A fact counts only when it appears in both the answer and a supported Evidence Composer slot.",
        citationBasis: `Answer Grounding ${EVIDENCE_COMPOSER_VERSION} + Answer Synthesis ${ANSWER_SYNTHESIS_VERSION}, composed from frozen Retrieval ${RETRIEVAL_VERSION}.`,
        evidenceSupportIsProxy: true,
        evidenceSupportApplicable: !classificationTask,
      },
      metrics: {
        retrievalHit: retrieval.hit,
        retrievalCoverage: retrieval.coverage,
        retrievalMatched: retrieval.matched,
        retrievalExpected: retrieval.total,
        citationHit: citation.hit,
        citationCoverage: citation.coverage,
        citationMatched: citation.matched,
        citationExpected: citation.total,
        answerFactHit: facts.hit,
        factCoverage: facts.coverage,
        factMatched: facts.matched,
        factExpected: facts.total,
        rawAnswerFactHit: rawFacts.hit,
        rawAnswerFactCoverage: rawFacts.coverage,
        rawAnswerFactMatched: rawFacts.matched,
        dateHit,
        abstentionHit,
        evidenceSupportHit,
        evidenceSupportCoverage: evidenceMetric?.coverage ?? null,
        checked: checks.length,
        passed: passedChecks,
        score: checks.length ? Number(((passedChecks / checks.length) * 100).toFixed(1)) : null,
      },
    });
  } catch (error) {
    const status = error instanceof AnythingLLMError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Evaluation failed.", runStatus: "error", retryable: isTransientAnythingLLMError(error) }, { status });
  }
}
