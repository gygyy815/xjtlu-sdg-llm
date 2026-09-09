import type {
  MarkdownSegmentBatch,
  MarkdownTextSegment,
} from "./markdown-ast.ts";
import {
  type TranslationApiRequestTelemetry,
  type TranslationProvider,
  ResponseTruncatedError,
} from "./provider.ts";
import { protectMarkdownDestinations, restoreMarkdownDestinations } from "./markdown.ts";
import { parseMarkdownSegmentResponseText } from "./markdown-ast.ts";
import { extractVisibleMarkdownText } from "./language.ts";
import type { TranslationProviderInput, TranslationProviderOutput } from "./types.ts";
import { translateTranslationViewWithQwen3Batched } from "./siliconflow-qwen3-ast.ts";
import { buildTranslationView } from "./preprocessor.ts";
import {
  analyzeFactualInvariants,
  detectSuspiciousChineseResidue,
} from "./validation.ts";

export type Qwen3UnitType =
  | "title"
  | "summary"
  | "digest_fallback"
  | "paragraph"
  | "heading"
  | "list_item"
  | "blockquote"
  | "link_label"
  | "image_alt";
export type Qwen3Usage = {
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
};
export type Qwen3RequestTelemetry = TranslationApiRequestTelemetry & {
  unitType: Qwen3UnitType;
  retryNumber: number;
  translatedCharacters?: number;
  finishReason?: string;
  truncated?: boolean;
  usage: Qwen3Usage;
  returnedModel?: string;
  protocolFailure?: boolean;
};
export type Qwen3ReliabilityEvent = {
  articleId: string;
  type:
    | "truncation_split"
    | "truncation_recovered"
    | "residue_violation"
    | "residue_repaired"
    | "factual_violation"
    | "factual_repaired"
    | "url_violation"
    | "protocol_failure"
    | "structured_recovery"
    | "single_segment_fallback";
  segmentId?: string;
  repairAttempts?: number;
  mixedTokens?: string[];
  residueFragments?: string[];
  factualAnalysis?: ReturnType<typeof analyzeFactualInvariants>;
  diagnostic?: Record<string, unknown>;
  sourceCharacters?: number;
  splitDepth?: number;
  splitSizes?: number[];
};
export type SiliconFlowQwen3ProviderOptions = {
  apiKey: string;
  baseUrl: string;
  model?: string;
  timeoutMs?: number;
  maxAttempts?: number;
  retryBaseDelayMs?: number;
  fetchImpl?: typeof fetch;
  sleep?: (ms: number) => Promise<void>;
};

function endpoint(baseUrl: string) {
  let parsed: URL;
  try {
    parsed = new URL(baseUrl.trim());
  } catch {
    throw new Error("SILICONFLOW_BASE_URL must be a valid HTTP(S) URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("SILICONFLOW_BASE_URL must be a valid HTTP(S) URL");
  }
  if (parsed.username || parsed.password) {
    throw new Error("SILICONFLOW_BASE_URL must not contain credentials");
  }
  parsed.hash = "";
  if (!parsed.pathname.replace(/\/+$/u, "").endsWith("/chat/completions")) {
    parsed.pathname = `${parsed.pathname.replace(/\/+$/u, "")}/chat/completions`;
  }
  return parsed.toString();
}

function transient(status: number) {
  return status === 429 || status >= 500;
}

function network(error: unknown) {
  return error instanceof Error &&
    (error.name === "AbortError" || /(?:timeout|network|fetch failed|connection|socket)/iu.test(error.message));
}

function hasHan(value: string) {
  return /\p{Script=Han}/u.test(value);
}

function textOf(value: unknown) {
  const content = (value as { choices?: Array<{ message?: { content?: unknown } }> })?.choices?.[0]?.message?.content;
  if (typeof content === "string") return content.trim();
  if (Array.isArray(content)) {
    return content.map((part) => part && typeof part === "object" && typeof (part as { text?: unknown }).text === "string" ? (part as { text: string }).text : "").join("").trim();
  }
  return "";
}

function unitTypeFor(segment: MarkdownTextSegment): Qwen3UnitType {
  return segment.unitType ?? "paragraph";
}

export class SiliconFlowQwen3TranslationProvider implements TranslationProvider {
  readonly name = "siliconflow-qwen3";
  readonly model: string;
  private readonly url: string;
  private readonly apiKey: string;
  private readonly timeoutMs: number;
  private readonly maxAttempts: number;
  private readonly retryBaseDelayMs: number;
  private readonly fetchImpl: typeof fetch;
  private readonly sleep: (ms: number) => Promise<void>;
  private readonly telemetry: Qwen3RequestTelemetry[] = [];
  private readonly reliabilityTelemetry: Qwen3ReliabilityEvent[] = [];
  private static readonly MIN_SPLIT_CHARACTERS = 360;
  private static readonly MAX_SPLIT_DEPTH = 2;

  constructor(options: SiliconFlowQwen3ProviderOptions) {
    if (!options.apiKey.trim()) throw new Error("SILICONFLOW_API_KEY is required");
    this.url = endpoint(options.baseUrl);
    this.apiKey = options.apiKey.trim();
    this.model = options.model?.trim() || "Qwen/Qwen3-8B";
    this.timeoutMs = Number.isFinite(options.timeoutMs) && (options.timeoutMs ?? 0) > 0 ? Math.floor(options.timeoutMs!) : 60_000;
    this.maxAttempts = Number.isSafeInteger(options.maxAttempts) && (options.maxAttempts ?? 0) > 0 ? Math.min(3, options.maxAttempts!) : 3;
    this.retryBaseDelayMs = Number.isFinite(options.retryBaseDelayMs) && (options.retryBaseDelayMs ?? 0) >= 0 ? Math.floor(options.retryBaseDelayMs!) : 250;
    this.fetchImpl = options.fetchImpl ?? fetch;
    this.sleep = options.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  }

  getRequestTelemetry() { return [...this.telemetry]; }
  getQwen3ReliabilityTelemetry() { return [...this.reliabilityTelemetry]; }

  private articleContext(input: TranslationProviderInput) {
    const source = `${input.title}\n${input.summary ?? input.digest ?? ""}\n${extractVisibleMarkdownText(input.content).slice(0, 2_000)}`;
    const englishTerms = [...new Set(source.match(/\b(?:[A-Z][A-Za-z&'’.-]*)(?:\s+(?:[A-Z][A-Za-z&'’.-]*|of|and|the|for)){1,6}\b/gu) ?? [])].slice(0, 8);
    return [
      "Article context (context only; translate only the requested segments):",
      `Title: ${input.title.slice(0, 300)}`,
      ...(input.summary ? [`Summary: ${input.summary.slice(0, 500)}`] : []),
      ...(input.publishedAt ? [`Published date: ${input.publishedAt}`] : []),
      ...(englishTerms.length ? [`Existing English names/terms: ${englishTerms.join("; ")}`] : []),
      "Preserve whether events are future, ongoing, or completed.",
      "Preserve names, dates, numbers and factual values exactly.",
      "Use consistent names throughout this article.",
    ].join("\n");
  }

  private async request(
    source: string,
    input: TranslationProviderInput,
    unitType: Qwen3UnitType,
    purpose: Qwen3RequestTelemetry["purpose"],
    options: { repair?: boolean; segmentCount?: number; segmentId?: string; additionalInstructions?: string } = {},
  ) {
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const prompt = [
      "Translate the following Chinese text into natural English suitable for an international university website.",
      "Translate faithfully; do not summarize, omit, add, or change facts.",
      "Preserve names, dates, numbers, percentages, emails, phone numbers and URLs.",
      "Translate all reader-visible Chinese, including mixed expressions.",
      "Return ONLY the English translation.",
      ...(options.repair ? ["The previous output contained untranslated Chinese or changed a factual value. Correct the entire requested segment."] : []),
      ...(options.additionalInstructions ? [options.additionalInstructions] : []),
      "\n",
      this.articleContext(input),
      "\nTEXT:\n",
      source,
    ].join("\n");

    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let status: number | undefined;
      try {
        const response = await this.fetchImpl(this.url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify({
            model: this.model,
            messages: [
              { role: "system", content: "You are a professional Chinese-to-English translator." },
              { role: "user", content: prompt },
            ],
            temperature: 0.1,
            max_tokens: Math.min(4096, Math.max(512, Math.ceil([...source].length * 2.5))),
            enable_thinking: false,
          }),
          signal: controller.signal,
        });
        status = response.status;
        const base = {
          articleId: input.id,
          purpose,
          sourceCharacters: [...source].length,
          segmentCount: options.segmentCount ?? 1,
          startedAt,
          elapsedMs: Date.now() - started,
          httpStatus: status,
          retryAttempt: attempt - 1,
          retryNumber: attempt - 1,
          unitType,
        };
        if (!response.ok) {
          this.telemetry.push({ ...base, success: false, usage: {} });
          throw Object.assign(new Error(`SiliconFlow Qwen3 request failed with HTTP ${response.status}`), { status: response.status });
        }
        const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>; usage?: Qwen3Usage; model?: string };
        const choice = payload.choices?.[0];
        const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : undefined;
        const truncated = finishReason === "length";
        const raw = textOf(payload);
        this.telemetry.push({ ...base, success: !truncated, responseCharacters: [...raw].length, translatedCharacters: [...raw].length, ...(finishReason ? { finishReason } : {}), ...(truncated ? { truncated: true } : {}), usage: payload.usage ?? {}, ...(payload.model ? { returnedModel: payload.model } : {}) });
        if (truncated) throw new ResponseTruncatedError("SiliconFlow Qwen3 response was truncated");
        if (!raw) throw new Error("SiliconFlow Qwen3 returned an empty translation");
        return raw;
      } catch (error) {
        const retryable = (status !== undefined && transient(status)) || network(error);
        if (!retryable || attempt >= this.maxAttempts) throw error;
        await this.sleep(this.retryBaseDelayMs * 2 ** (attempt - 1));
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error("SiliconFlow Qwen3 translation failed");
  }

  private async requestJsonBatch(batch: MarkdownSegmentBatch, input: TranslationProviderInput, repair = false, additionalInstructions?: string, splitDepth = 0) {
    const expected = batch;
    const protectedSegments = batch.map((segment) => ({
      ...segment,
      protected: protectMarkdownDestinations(segment.text),
    }));
    const source = protectedSegments.map((segment) => `${segment.id}:\n${segment.protected.markdown}`).join("\n\n");
    const startedAt = new Date().toISOString();
    const started = Date.now();
    const prompt = [
      "Translate each requested Chinese segment into natural English.",
      "Return ONLY one JSON object. Keys must be the exact segment IDs and values must be complete translations.",
      "Do not add or remove IDs. Preserve all facts, names, dates, numbers and punctuation inside each value.",
      ...(repair ? ["The previous translation left Chinese or changed a factual value. Translate the whole segment again."] : []),
      ...(additionalInstructions ? [additionalInstructions] : []),
      this.articleContext(input),
      "SEGMENTS:\n",
      source,
    ].join("\n");
    for (let attempt = 1; attempt <= this.maxAttempts; attempt += 1) {
      const controller = new AbortController();
      const timer = setTimeout(() => controller.abort(), this.timeoutMs);
      let status: number | undefined;
      try {
        const response = await this.fetchImpl(this.url, {
          method: "POST",
          headers: { "content-type": "application/json", authorization: `Bearer ${this.apiKey}` },
          body: JSON.stringify({ model: this.model, messages: [{ role: "system", content: "You are a professional Chinese-to-English translator." }, { role: "user", content: prompt }], temperature: 0.1, max_tokens: Math.min(4096, Math.max(768, Math.ceil([...source].length * 2.5))), enable_thinking: false }),
          signal: controller.signal,
        });
        status = response.status;
        const base = { articleId: input.id, purpose: repair ? "residue_repair" as const : "body_segment_batch" as const, sourceCharacters: [...source].length, segmentCount: batch.length, startedAt, elapsedMs: Date.now() - started, httpStatus: status, retryAttempt: attempt - 1, retryNumber: attempt - 1, unitType: unitTypeFor(batch[0]), splitDepth };
        if (!response.ok) {
          this.telemetry.push({ ...base, success: false, usage: {} });
          throw Object.assign(new Error(`SiliconFlow Qwen3 request failed with HTTP ${response.status}`), { status: response.status });
        }
        const payload = await response.json() as { choices?: Array<{ message?: { content?: unknown }; finish_reason?: unknown }>; usage?: Qwen3Usage; model?: string };
        const choice = payload.choices?.[0];
        const finishReason = typeof choice?.finish_reason === "string" ? choice.finish_reason : undefined;
        const raw = textOf(payload);
        const truncated = finishReason === "length";
        this.telemetry.push({ ...base, success: !truncated, responseCharacters: [...raw].length, translatedCharacters: [...raw].length, ...(finishReason ? { finishReason } : {}), ...(truncated ? { truncated: true } : {}), usage: payload.usage ?? {}, ...(payload.model ? { returnedModel: payload.model } : {}) });
        if (truncated) throw new ResponseTruncatedError("SiliconFlow Qwen3 response was truncated");
        if (!raw) throw new Error("SiliconFlow Qwen3 returned an empty translation");
        try {
          const parsed = parseMarkdownSegmentResponseText(raw, protectedSegments.map((segment) => ({ ...segment, text: segment.protected.markdown })));
          const restored = new Map<string, string>();
          for (const segment of protectedSegments) {
            const value = parsed.get(segment.id);
            if (value === undefined) throw new Error(`Qwen3 omitted ${segment.id}`);
            restored.set(segment.id, restoreMarkdownDestinations(value, segment.protected.placeholders));
          }
          return restored;
        } catch (error) {
          this.reliabilityTelemetry.push({ articleId: input.id, type: "protocol_failure", segmentId: batch[0]?.id, diagnostic: { message: error instanceof Error ? error.message : String(error), expectedIds: expected.map(({ id }) => id) } });
          const protocol = error instanceof Error ? error : new Error(String(error));
          Object.assign(protocol, { diagnostic: { validationStage: "provider-response", expectedIds: expected.map(({ id }) => id), rawResponseCharacters: [...raw].length } });
          throw protocol;
        }
      } catch (error) {
        const retryable = (status !== undefined && transient(status)) || network(error);
        if (!retryable || attempt >= this.maxAttempts) throw error;
        await this.sleep(this.retryBaseDelayMs * 2 ** (attempt - 1));
      } finally {
        clearTimeout(timer);
      }
    }
    throw new Error("SiliconFlow Qwen3 batch translation failed");
  }

  private residueInstructions(analysis: ReturnType<typeof detectSuspiciousChineseResidue>) {
    const spans = [...new Set([...analysis.mixedLatinHanTokens, ...analysis.residueFragments])].slice(0, 8);
    return ["Residual expressions that must be fully translated:", ...spans.map((span) => `- ${span}`), "Return only the complete English segment; do not leave reader-visible Chinese characters."].join("\n");
  }

  private async repairSegment(segment: MarkdownTextSegment, current: string, input: TranslationProviderInput) {
    let value = current;
    let attempts = 0;
    let residue = detectSuspiciousChineseResidue(value);
    if (!residue.suspicious && residue.hanCharacters === 0) return { value, attempts };
    this.reliabilityTelemetry.push({ articleId: input.id, type: "residue_violation", segmentId: segment.id, mixedTokens: residue.mixedLatinHanTokens, residueFragments: residue.residueFragments });
    attempts = 1;
    const repaired = await this.requestJsonBatch([segment], input, true, this.residueInstructions(residue));
    value = repaired.get(segment.id) ?? value;
    residue = detectSuspiciousChineseResidue(value);
    if (residue.suspicious || residue.hanCharacters > 0) {
      if (input.allowChineseResidue) return { value, attempts };
      throw Object.assign(new Error(`Qwen3 left Chinese residue in ${segment.id} after one repair attempt`), { diagnostic: { failedSegmentId: segment.id, repairAttempts: attempts, ...residue } });
    }
    this.reliabilityTelemetry.push({ articleId: input.id, type: "residue_repaired", segmentId: segment.id, repairAttempts: attempts });
    return { value, attempts };
  }

  private async repairField(source: string, current: string, input: TranslationProviderInput, unitType: Qwen3UnitType) {
    let value = current;
    const residue = detectSuspiciousChineseResidue(value);
    if (residue.suspicious || residue.hanCharacters > 0) {
      this.reliabilityTelemetry.push({ articleId: input.id, type: "residue_violation", mixedTokens: residue.mixedLatinHanTokens, residueFragments: residue.residueFragments });
      value = await this.request(source, input, unitType, unitType === "title" ? "title" : unitType === "summary" ? "summary" : "digest_fallback", { repair: true, additionalInstructions: this.residueInstructions(residue) });
      const repairedResidue = detectSuspiciousChineseResidue(value);
      if (repairedResidue.suspicious || repairedResidue.hanCharacters > 0) {
        if (!input.allowChineseResidue) throw new Error(`Qwen3 left Chinese residue in ${unitType}`);
      } else {
        this.reliabilityTelemetry.push({ articleId: input.id, type: "residue_repaired", repairAttempts: 1 });
      }
    }
    let factual = analyzeFactualInvariants(source, value);
    if (!factual.valid) {
      this.reliabilityTelemetry.push({ articleId: input.id, type: "factual_violation", factualAnalysis: factual });
      value = await this.request(source, input, unitType, unitType === "title" ? "title" : unitType === "summary" ? "summary" : "digest_fallback", { repair: true, additionalInstructions: "Preserve all hard factual values exactly; generic repeated integers may vary only when they are not part of a date, amount, percentage, email, phone number, or decimal." });
      factual = analyzeFactualInvariants(source, value);
      if (!factual.valid) throw Object.assign(new Error(`Qwen3 factual invariant failed in ${unitType}`), { diagnostic: factual });
      this.reliabilityTelemetry.push({ articleId: input.id, type: "factual_repaired", repairAttempts: 1 });
    }
    return value;
  }

  private splitBatch(batch: MarkdownSegmentBatch): [MarkdownSegmentBatch, MarkdownSegmentBatch] {
    if (batch.length > 1) {
      const midpoint = Math.ceil(batch.length / 2);
      return [batch.slice(0, midpoint), batch.slice(midpoint)];
    }
    const segment = batch[0];
    const characters = [...segment.text];
    const midpoint = Math.max(1, Math.floor(characters.length / 2));
    let splitAt = midpoint;
    for (let index = midpoint; index > Math.max(1, midpoint - 120); index -= 1) {
      if (/\s|[。！？；.!?;]/u.test(characters[index - 1] ?? "")) {
        splitAt = index;
        break;
      }
    }
    return [
      [{ ...segment, id: `${segment.id}__a`, text: characters.slice(0, splitAt).join("") }],
      [{ ...segment, id: `${segment.id}__b`, text: characters.slice(splitAt).join("") }],
    ];
  }

  private isStructuredProtocolFailure(error: unknown) {
    if (error instanceof ResponseTruncatedError) return false;
    const diagnostic = error && typeof error === "object" && "diagnostic" in error
      ? (error as { diagnostic?: unknown }).diagnostic
      : undefined;
    if (diagnostic && typeof diagnostic === "object" && (diagnostic as { validationStage?: unknown }).validationStage === "provider-response") return true;
    return error instanceof Error && /(?:omitted\s+SEG_|invalid\s+(?:JSON|Markdown segment)|segment response|did not contain a choice)/iu.test(error.message);
  }

  private async translateSingleSegmentPlain(segment: MarkdownTextSegment, input: TranslationProviderInput, splitDepth: number) {
    const protectedSegment = protectMarkdownDestinations(segment.text);
    const raw = await this.request(
      protectedSegment.markdown,
      input,
      unitTypeFor(segment),
      "body_segment_batch",
      {
        segmentCount: 1,
        segmentId: segment.id,
        additionalInstructions: "Structured output was unavailable. Return only the plain translated text for this one segment; do not return JSON, Markdown fences, IDs, or commentary.",
      },
    );
    const value = restoreMarkdownDestinations(raw, protectedSegment.placeholders);
    this.reliabilityTelemetry.push({
      articleId: input.id,
      type: "single_segment_fallback",
      segmentId: segment.id,
      sourceCharacters: [...segment.text].length,
      splitDepth,
    });
    return new Map([[segment.id, value]]);
  }

  private async translateBatchAdaptive(
    batch: MarkdownSegmentBatch,
    input: TranslationProviderInput,
    depth = 0,
    protocolRetry = false,
  ): Promise<ReadonlyMap<string, string>> {
    try {
      return await this.translateBatch(batch, input, depth, protocolRetry);
    } catch (error) {
      if (this.isStructuredProtocolFailure(error)) {
        if (!protocolRetry) {
          this.reliabilityTelemetry.push({ articleId: input.id, type: "structured_recovery", segmentId: batch[0]?.id, sourceCharacters: batch.reduce((sum, item) => sum + [...item.text].length, 0), splitDepth: depth });
          try {
            return await this.translateBatchAdaptive(batch, input, depth, true);
          } catch (retryError) {
            error = retryError;
          }
        }
        const sourceCharacters = batch.reduce((total, segment) => total + [...segment.text].length, 0);
        if (depth < SiliconFlowQwen3TranslationProvider.MAX_SPLIT_DEPTH && sourceCharacters > SiliconFlowQwen3TranslationProvider.MIN_SPLIT_CHARACTERS) {
          const [left, right] = this.splitBatch(batch);
          const leftResult = await this.translateBatchAdaptive(left, input, depth + 1);
          const rightResult = await this.translateBatchAdaptive(right, input, depth + 1);
          const combined = new Map<string, string>([...leftResult, ...rightResult]);
          if (batch.length === 1) {
            combined.set(batch[0].id, `${combined.get(`${batch[0].id}__a`) ?? ""}${combined.get(`${batch[0].id}__b`) ?? ""}`);
            combined.delete(`${batch[0].id}__a`);
            combined.delete(`${batch[0].id}__b`);
          }
          return combined;
        }
        if (batch.length === 1) return this.translateSingleSegmentPlain(batch[0], input, depth);
        throw error;
      }
      if (!(error instanceof ResponseTruncatedError)) throw error;
      const sourceCharacters = batch.reduce((total, segment) => total + [...segment.text].length, 0);
      if (
        depth >= SiliconFlowQwen3TranslationProvider.MAX_SPLIT_DEPTH ||
        sourceCharacters <= SiliconFlowQwen3TranslationProvider.MIN_SPLIT_CHARACTERS
      ) {
        this.reliabilityTelemetry.push({
          articleId: input.id,
          type: "truncation_split",
          segmentId: batch[0]?.id,
          sourceCharacters,
          splitDepth: depth,
          splitSizes: [sourceCharacters],
        });
        throw error;
      }
      const [left, right] = this.splitBatch(batch);
      const splitSizes = [left, right].map((child) => child.reduce((total, segment) => total + [...segment.text].length, 0));
      this.reliabilityTelemetry.push({
        articleId: input.id,
        type: "truncation_split",
        segmentId: batch[0]?.id,
        sourceCharacters,
        splitDepth: depth + 1,
        splitSizes,
      });
      const leftResult = await this.translateBatchAdaptive(left, input, depth + 1);
      const rightResult = await this.translateBatchAdaptive(right, input, depth + 1);
      const combined = new Map<string, string>();
      for (const [id, value] of leftResult) combined.set(id, value);
      for (const [id, value] of rightResult) combined.set(id, value);
      if (batch.length === 1) {
        const id = batch[0].id;
        combined.set(id, `${combined.get(`${id}__a`) ?? ""}${combined.get(`${id}__b`) ?? ""}`);
        combined.delete(`${id}__a`);
        combined.delete(`${id}__b`);
      }
      this.reliabilityTelemetry.push({
        articleId: input.id,
        type: "truncation_recovered",
        segmentId: batch[0]?.id,
        sourceCharacters,
        splitDepth: depth + 1,
        splitSizes,
      });
      return combined;
    }
  }

  private async translateBatch(batch: MarkdownSegmentBatch, input: TranslationProviderInput, splitDepth = 0, repair = false) {
    const initial = await this.requestJsonBatch(batch, input, repair, undefined, splitDepth);
    const result = new Map(initial);
    for (const segment of batch) {
      let current = result.get(segment.id)!;
      const repaired = await this.repairSegment(segment, current, input);
      current = repaired.value;
      let factual = analyzeFactualInvariants(segment.text, current);
      if (!factual.valid) {
        this.reliabilityTelemetry.push({ articleId: input.id, type: "factual_violation", segmentId: segment.id, factualAnalysis: factual });
        const repairedMap = await this.requestJsonBatch([segment], input, true, "Preserve all hard factual values exactly; generic repeated integers may vary only when they are not part of a date, amount, percentage, email, phone number, or decimal.", splitDepth);
        current = repairedMap.get(segment.id) ?? current;
        factual = analyzeFactualInvariants(segment.text, current);
        if (!factual.valid) throw Object.assign(new Error(`Qwen3 factual invariant failed in ${segment.id}`), { diagnostic: { failedSegmentId: segment.id, repairAttempts: repaired.attempts + 1, ...factual } });
        this.reliabilityTelemetry.push({ articleId: input.id, type: "factual_repaired", segmentId: segment.id, repairAttempts: repaired.attempts + 1 });
      }
      result.set(segment.id, current);
    }
    return result;
  }

  async translateText(source: string, context: { articleId?: string; unitType: Qwen3UnitType; articleTitle?: string; articleSummary?: string; publishedAt?: string }, input?: TranslationProviderInput) {
    if (!hasHan(source)) return source;
    const requestInput: TranslationProviderInput = input ?? {
      id: context.articleId ?? "experiment",
      title: context.articleTitle ?? source,
      ...(context.articleSummary ? { summary: context.articleSummary } : {}),
      ...(context.publishedAt ? { publishedAt: context.publishedAt } : {}),
      content: source,
      sourceLanguage: "zh",
      targetLanguage: "en",
    };
    const prompt = ["Preserve all names, dates and numbers exactly.", "Translate every Chinese expression, including mixed Chinese-English words."];
    const raw = await this.request(source, requestInput, context.unitType, context.unitType === "title" ? "title" : context.unitType === "summary" ? "summary" : context.unitType === "digest_fallback" ? "digest_fallback" : "body_segment_batch", { additionalInstructions: prompt.join("\n") });
    return raw;
  }

  async translateArticle(input: TranslationProviderInput): Promise<TranslationProviderOutput> {
    const title = await this.repairField(input.title, await this.translateText(input.title, { articleId: input.id, unitType: "title" }, input), input, "title");
    const sourceSummary = input.summary ?? input.digest;
    const translatedSummary = sourceSummary ? await this.repairField(sourceSummary, await this.translateText(sourceSummary, { articleId: input.id, unitType: input.summary !== undefined ? "summary" : "digest_fallback" }, input), input, input.summary !== undefined ? "summary" : "digest_fallback") : undefined;
    const sourceView = input.translationView ?? buildTranslationView(input.content, { articleId: input.id });
    const content = await translateTranslationViewWithQwen3Batched(sourceView, (batch) => this.translateBatchAdaptive(batch, input), 2_400, {
      sourceLanguage: input.sourceLanguage,
      targetLanguage: input.targetLanguage,
      checkpoint: input.checkpoint,
      checkpointContextHash: input.checkpointContextHash,
      onSegmentTranslated: input.onSegmentTranslated,
    });
    return { title, ...(input.summary !== undefined ? { summary: translatedSummary } : input.digest !== undefined ? { digest: translatedSummary } : {}), content: content.markdown };
  }
}

export function createSiliconFlowQwen3ProviderFromEnvironment(fetchImpl?: typeof fetch) {
  const apiKey = process.env.SILICONFLOW_API_KEY?.trim();
  // Production's application environment historically called this variable
  // SILICONFLOW_API_BASE; keep the translation-specific name preferred while
  // accepting the deployed alias for the lazy Article Center route.
  const baseUrl = (process.env.SILICONFLOW_BASE_URL || process.env.SILICONFLOW_API_BASE)?.trim();
  if (!apiKey || !baseUrl) throw new Error("Qwen3 pilot requires SILICONFLOW_API_KEY and SILICONFLOW_BASE_URL");
  return new SiliconFlowQwen3TranslationProvider({ apiKey, baseUrl, model: process.env.SILICONFLOW_TRANSLATION_MODEL?.trim() || "Qwen/Qwen3-8B", fetchImpl });
}
