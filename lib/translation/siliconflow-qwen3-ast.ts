import {
  translateMarkdownAst,
  batchMarkdownSegments,
  type MarkdownSegmentBatch,
  type MarkdownTextSegment,
} from "./markdown-ast.ts";
import type { Qwen3UnitType } from "./siliconflow-qwen3.ts";
import type { TranslationView } from "./preprocessor.ts";
import { translationSegmentCheckpointKey } from "./preprocessor.ts";
import type { TranslationProviderInput } from "./types.ts";

export type Qwen3AstResult = {
  markdown: string;
  units: number;
  sourceCharacters: number;
};

export type TranslationViewResult = Qwen3AstResult & {
  excluded: TranslationView["excluded"];
};

export type Qwen3TextTranslator = (
  text: string,
  unitType: Exclude<Qwen3UnitType, "title" | "summary" | "digest_fallback">,
) => Promise<string>;

export type Qwen3BatchTranslator = (
  batch: MarkdownSegmentBatch,
) => Promise<ReadonlyMap<string, string>>;

function sourceCharacters(batch: readonly MarkdownTextSegment[]) {
  return batch.reduce((total, segment) => total + [...segment.text].length, 0);
}

/**
 * Translate reader-visible Han-containing segments in semantic batches. GFM
 * tables, links, images, code and pure-English text are handled by the shared
 * AST layer and never sent as raw Markdown to Qwen3.
 */
export async function translateReaderVisibleMarkdownWithQwen3Batched(
  markdown: string,
  translateBatch: Qwen3BatchTranslator,
  maxCharacters = 2_400,
): Promise<Qwen3AstResult> {
  let units = 0;
  let translatedCharacters = 0;
  const translated = await translateMarkdownAst(
    markdown,
    async (batch) => {
      units += 1;
      translatedCharacters += sourceCharacters(batch);
      return translateBatch(batch);
    },
    maxCharacters,
  );
  return { markdown: translated, units, sourceCharacters: translatedCharacters };
}

/** Translate only deterministic Translation View segments, then reconstruct the original AST. */
export async function translateTranslationViewWithQwen3Batched(
  view: TranslationView,
  translateBatch: Qwen3BatchTranslator,
  maxCharacters = 2_400,
  options: Pick<TranslationProviderInput, "checkpoint" | "checkpointContextHash" | "onSegmentTranslated" | "sourceLanguage" | "targetLanguage"> = { sourceLanguage: "zh", targetLanguage: "en" },
): Promise<TranslationViewResult> {
  let units = 0;
  let translatedCharacters = 0;
  const translated = new Map<string, string>();
  for (const batch of batchMarkdownSegments(view.segments, maxCharacters)) {
    const pending = batch.filter((segment) => !options.checkpoint?.has(segment.id));
    for (const segment of batch) {
      const cached = options.checkpoint?.get(segment.id);
      if (cached) translated.set(segment.id, cached.text);
    }
    if (!pending.length) continue;
    units += 1;
    translatedCharacters += sourceCharacters(pending);
    const result = await translateBatch(pending);
    for (const segment of pending) {
      const value = result.get(segment.id);
      if (typeof value !== "string") throw new Error(`Translation provider omitted Markdown segment ${segment.id}`);
      translated.set(segment.id, value);
      const key = translationSegmentCheckpointKey({ segmentId: segment.id, sourceText: segment.text, contextHash: options.checkpointContextHash ?? "", sourceLanguage: options.sourceLanguage, targetLanguage: options.targetLanguage });
      await options.onSegmentTranslated?.({ id: segment.id, key, text: value });
    }
  }
  return {
    markdown: view.reconstruct(translated),
    units,
    sourceCharacters: translatedCharacters,
    excluded: view.excluded,
  };
}

/** Backwards-compatible adapter for tests and simple callers. */
export async function translateReaderVisibleMarkdownWithQwen3(
  markdown: string,
  translate: Qwen3TextTranslator,
  maxCharacters = 2_400,
): Promise<Qwen3AstResult> {
  return translateReaderVisibleMarkdownWithQwen3Batched(
    markdown,
    async (batch) => {
      const output = new Map<string, string>();
      for (const segment of batch) {
        const unitType = segment.unitType ?? "paragraph";
        output.set(segment.id, await translate(segment.text, unitType));
      }
      return output;
    },
    maxCharacters,
  );
}
