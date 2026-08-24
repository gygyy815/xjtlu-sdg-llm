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

function cleanTerms(value: unknown) {
  return Array.isArray(value)
    ? value.map((item) => String(item || "").trim()).filter(Boolean).slice(0, 12)
    : [];
}

function includesTerm(haystack: string, term: string) {
  return haystack.toLocaleLowerCase().includes(term.toLocaleLowerCase());
}

function sourceText(source: { title?: string; source?: string; text?: string; url?: string }) {
  return [source.title, source.source, source.text, source.url].filter(Boolean).join("\n");
}

function abstained(answer: string) {
  return /(未找到|无法确认|不能确认|文档未明确|没有明确证据|暂无明确|not found|cannot confirm|unable to confirm|not explicitly stated|insufficient evidence|no clear evidence)/i.test(answer);
}

export async function POST(request: Request) {
  try {
    const body = (await request.json()) as EvalRequest;
    const question = String(body.question || "").trim();
    const workspaceSlug = String(body.workspaceSlug || "").trim();
    const expectedSourceTerms = cleanTerms(body.expectedSourceTerms);
    const expectedAnswerTerms = cleanTerms(body.expectedAnswerTerms);
    const expectedDate = String(body.expectedDate || "").trim();
    const expectAbstain = Boolean(body.expectAbstain);

    if (!question) return NextResponse.json({ error: "Evaluation question is required." }, { status: 400 });
    if (!workspaceSlug) return NextResponse.json({ error: "Workspace is required." }, { status: 400 });

    const [answerResult, retrievalResult] = await Promise.allSettled([
      askAnythingLLM(workspaceSlug, question, "query"),
      vectorSearchAnythingLLM(workspaceSlug, question, 6, 0.2),
    ]);

    if (answerResult.status === "rejected") throw answerResult.reason;

    const answer = answerResult.value.text || "";
    const citations = answerResult.value.citations || [];
    const retrieved = retrievalResult.status === "fulfilled" ? retrievalResult.value : [];

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
      retrievalWarning: retrievalResult.status === "rejected" ? (retrievalResult.reason instanceof Error ? retrievalResult.reason.message : "Vector search diagnostic failed.") : "",
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
    return NextResponse.json({ error: error instanceof Error ? error.message : "Evaluation failed." }, { status });
  }
}
