import { NextResponse } from "next/server";
import { AnythingLLMError, askAnythingLLM, vectorSearchAnythingLLM } from "@/lib/anythingllm";

type EvalRequest = {
  question?: string;
  workspaceSlug?: string;
  expectedSourceTerms?: string[];
  expectedAnswerTerms?: string[];
  expectedDate?: string;
  expectAbstain?: boolean;
};

const EMPTY_MARKERS = new Set(["", "留空", "未定义", "n/a", "na", "none", "null", "undefined"]);

function cleanTerms(value: unknown) {
  return Array.isArray(value)
    ? value
        .map((item) => String(item || "").trim())
        .filter((item) => !EMPTY_MARKERS.has(item.toLocaleLowerCase()))
        .slice(0, 12)
    : [];
}

function cleanOptionalText(value: unknown) {
  const text = String(value || "").trim();
  return EMPTY_MARKERS.has(text.toLocaleLowerCase()) ? "" : text;
}

function includesTerm(haystack: string, term: string) {
  return haystack.toLocaleLowerCase().includes(term.toLocaleLowerCase());
}

function sourceText(source: { title?: string; source?: string; text?: string; url?: string }) {
  return [source.title, source.source, source.text, source.url].filter(Boolean).join("\n");
}

function abstained(answer: string) {
  return /(未找到|没有找到|无法确认|不能确认|文档未明确|没有明确证据|暂无明确|没有提及|未提及|未提供|没有相关信息|知识库中没有|当前知识库中没有|not found|cannot confirm|unable to confirm|not explicitly stated|insufficient evidence|no clear evidence|not mentioned|does not mention|no relevant information|not provided)/i.test(answer);
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isTransientAnythingLLMError(error: unknown) {
  if (error instanceof AnythingLLMError) {
    return error.status >= 500 || /connection|timeout|temporar|upstream/i.test(error.message);
  }
  return error instanceof Error && /connection|timeout|fetch failed|socket|network/i.test(error.message);
}

function evaluationSessionId(attempt: number) {
  // Evaluation cases must be statistically independent. Reusing AnythingLLM's default
  // workspace chat silently accumulates prior benchmark questions in history, which can
  // eventually inflate context and make the upstream model fail even while normal chat
  // (which supplies its own sessionId) still works.
  return `rag-eval-${Date.now()}-${attempt}-${Math.random().toString(36).slice(2, 10)}`;
}

async function askWithRetry(workspaceSlug: string, question: string) {
  let lastError: unknown;
  for (let attempt = 1; attempt <= 2; attempt += 1) {
    try {
      const sessionId = evaluationSessionId(attempt);
      const value = await askAnythingLLM(workspaceSlug, question, "query", sessionId);
      return { value, attempts: attempt, isolatedSession: true };
    } catch (error) {
      lastError = error;
      if (attempt >= 2 || !isTransientAnythingLLMError(error)) throw error;
      await delay(1200);
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

    if (!question) return NextResponse.json({ error: "Evaluation question is required." }, { status: 400 });
    if (!workspaceSlug) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    // Run retrieval first so its diagnostics cannot compete with the chat request on
    // local/single-worker providers. The chat itself uses a fresh AnythingLLM session
    // for every evaluation run so prior benchmark questions never contaminate context.
    let retrieved: Awaited<ReturnType<typeof vectorSearchAnythingLLM>> = [];
    let retrievalWarning = "";
    try {
      retrieved = await vectorSearchAnythingLLM(workspaceSlug, question, 6, 0.2);
    } catch (error) {
      retrievalWarning = error instanceof Error ? error.message : "Vector search diagnostic failed.";
    }

    const answerRun = await askWithRetry(workspaceSlug, question);
    const answer = answerRun.value.text || "";
    const citations = answerRun.value.citations || [];

    const retrievalCorpus = retrieved.map(sourceText).join("\n");
    const citationCorpus = citations.map(sourceText).join("\n");

    const retrievalHit = expectedSourceTerms.length
      ? expectedSourceTerms.some((term) => includesTerm(retrievalCorpus, term))
      : null;
    const citationHit = expectedSourceTerms.length
      ? expectedSourceTerms.some((term) => includesTerm(citationCorpus, term))
      : null;
    const answerFactHit = expectedAnswerTerms.length
      ? expectedAnswerTerms.every((term) => includesTerm(answer, term))
      : null;
    const dateHit = expectedDate ? includesTerm(answer, expectedDate) : null;
    const abstentionHit = expectAbstain ? abstained(answer) : null;

    const checks = [retrievalHit, citationHit, answerFactHit, dateHit, abstentionHit].filter((value): value is boolean => typeof value === "boolean");
    const passedChecks = checks.filter(Boolean).length;

    return NextResponse.json({
      question,
      workspaceSlug,
      answer,
      citations,
      retrieved,
      retrievalWarning,
      runtime: {
        answerAttempts: answerRun.attempts,
        sequentialRequests: true,
        isolatedSession: answerRun.isolatedSession,
      },
      metrics: {
        retrievalHit,
        citationHit,
        answerFactHit,
        dateHit,
        abstentionHit,
        checked: checks.length,
        passed: passedChecks,
        score: checks.length ? Number(((passedChecks / checks.length) * 100).toFixed(1)) : null,
      },
    });
  } catch (error) {
    const status = error instanceof AnythingLLMError ? error.status : 500;
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Evaluation failed.",
        runStatus: "error",
        retryable: isTransientAnythingLLMError(error),
      },
      { status },
    );
  }
}
