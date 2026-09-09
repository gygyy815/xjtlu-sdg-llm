import { readFile } from "node:fs/promises";
import { getArticleById } from "../knowledge-base/repository.ts";
import { detectMarkdownLanguage } from "./language.ts";
import { FileSystemTranslationRepository, validateTranslationRecordV2 } from "./repository.ts";
import { translationSourceHash } from "./source-hash.ts";
import type { TranslationRecordV2 } from "./types.ts";

export type TranslationAvailabilityStatus = "fresh" | "missing" | "stale" | "invalid";

export type TranslationStatus = {
  articleId: string;
  status: TranslationAvailabilityStatus;
  sourceHash: string;
  sourceIsEnglish: boolean;
  /** True only for records carrying an explicit whole-article QA marker. */
  qualityValidated: boolean;
  record?: TranslationRecordV2;
  reason?: "not_found" | "malformed_json" | "invalid_schema" | "identity_mismatch";
};

type StatusOptions = {
  article?: Awaited<ReturnType<typeof getArticleById>>;
  repository?: FileSystemTranslationRepository;
  loadArticle?: typeof getArticleById;
};

/**
 * Read cache state without invoking the translation provider. Invalid files are
 * reported separately from a missing cache so callers can decide how to repair
 * them while never serving them as English content.
 */
export async function getTranslationStatus(
  articleId: string,
  options: StatusOptions = {},
): Promise<TranslationStatus> {
  const article = options.article ?? await (options.loadArticle ?? getArticleById)(articleId);
  if (!article) {
    return {
      articleId,
      status: "missing",
      sourceHash: "",
      sourceIsEnglish: false,
      qualityValidated: false,
      reason: "not_found",
    };
  }

  const sourceHash = translationSourceHash(article);
  const sourceIsEnglish = detectMarkdownLanguage(article.content).classification === "clearly_en";
  const repository = options.repository ?? new FileSystemTranslationRepository();
  const cachePath = repository.translationPath(articleId, "en");
  let parsed: unknown;
  try {
    parsed = JSON.parse(await readFile(cachePath, "utf8"));
  } catch (error) {
    if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") {
      return { articleId, status: "missing", sourceHash, sourceIsEnglish, qualityValidated: false };
    }
    if (error instanceof SyntaxError) {
      return { articleId, status: "invalid", sourceHash, sourceIsEnglish, qualityValidated: false, reason: "malformed_json" };
    }
    throw error;
  }

  try {
    validateTranslationRecordV2(parsed);
  } catch {
    return { articleId, status: "invalid", sourceHash, sourceIsEnglish, qualityValidated: false, reason: "invalid_schema" };
  }
  const record = parsed as TranslationRecordV2;
  if (record.articleId !== articleId || record.language !== "en") {
    return { articleId, status: "invalid", sourceHash, sourceIsEnglish, qualityValidated: false, reason: "identity_mismatch" };
  }
  return {
    articleId,
    status: record.sourceHash === sourceHash ? "fresh" : "stale",
    sourceHash,
    sourceIsEnglish,
    qualityValidated: record.qa?.status === "passed",
    record,
  };
}
