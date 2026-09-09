import type { ArticleDetail } from "../knowledge-base/types.ts";
import type { MarkdownLanguageClassification } from "./language.ts";
import type { TranslationView } from "./preprocessor.ts";

export type TranslationLanguage = string;

export type TranslationRecordV1 = {
  version: 1;
  articleId: string;
  sourceLanguage: TranslationLanguage;
  language: TranslationLanguage;
  title: string;
  digest?: string;
  content: string;
  translatedAt: string;
  provider: string;
  model: string;
};

export type TranslationRecordV2 = {
  version: 2;
  articleId: string;
  sourceHash: string;
  sourceLanguage: TranslationLanguage;
  language: TranslationLanguage;
  title: string;
  summary?: string;
  /** Legacy/fallback summary field. Written only when source summary is absent. */
  digest?: string;
  content: string;
  translatedAt: string;
  provider: string;
  model: string;
  /** Explicit QA/provenance marker written only after whole-article validation. */
  qa?: TranslationQualityMetadata;
};

export type TranslationQualityMetadata = {
  status: "passed";
  processingVersion: string;
  validationVersion: string;
  sourceViewVersion: string;
  validatedAt: string;
};

/** V1 remains readable; every new pipeline write is V2. */
export type TranslationRecord = TranslationRecordV1 | TranslationRecordV2;

export type TranslationProviderInput = Pick<
  ArticleDetail,
  "id" | "title" | "summary" | "digest" | "content" | "publishedAt"
> & {
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  ocrSectionsExcluded?: number;
  ocrCharactersExcluded?: number;
  /** Ephemeral AST-backed view; canonical Markdown is never replaced. */
  translationView?: TranslationView;
  /** Opt-in demo policy; strict Chinese-residue rejection remains the default. */
  allowChineseResidue?: boolean;
  /** Validated segment results from an interrupted article operation. */
  checkpoint?: ReadonlyMap<string, { key: string; text: string }>;
  checkpointContextHash?: string;
  /** Called after each segment passes provider-level validation. */
  onSegmentTranslated?: (segment: { id: string; key: string; text: string }) => Promise<void> | void;
};

export type TranslationCheckpointSegment = {
  key: string;
  text: string;
  validatedAt: string;
};

export type TranslationCheckpoint = {
  version: 1;
  articleId: string;
  sourceHash: string;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  processingVersion: string;
  contextHash: string;
  segments: Record<string, TranslationCheckpointSegment>;
};

export type TranslationProviderOutput = Pick<
  TranslationRecordV2,
  "title" | "summary" | "digest" | "content"
>;

export type TranslationSelectionStatus =
  | "missing"
  | "stale"
  | "fresh"
  | "already_target_language";

export type TranslationItemStatus =
  | "translated"
  | "skipped_existing"
  | "already_target_language"
  | "failed";

export type TranslationBatchItem = {
  articleId: string;
  title: string;
  publishedAt?: string;
  selectionStatus: TranslationSelectionStatus;
  status: TranslationItemStatus;
  languageDetection?: MarkdownLanguageClassification;
  storagePath?: string;
  sourceCharacters?: number;
  elapsedMs?: number;
  error?: string;
  failureCategory?: string;
  apiRequests?: number;
  bodySegmentBatches?: number;
  retryCount?: number;
  residueRepairCount?: number;
  factualRepairCount?: number;
  truncationSplitCount?: number;
  truncationRecoveryCount?: number;
  structuredRecoveryCount?: number;
  singleSegmentFallbackCount?: number;
  factualViolationCount?: number;
  ocrSectionsExcluded?: number;
  ocrCharactersExcluded?: number;
};

export type TranslationBatchReport = {
  version: 2;
  runId: string;
  startedAt: string;
  completedAt: string;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  provider: string;
  model: string;
  selection: {
    mode: "since" | "article_id";
    indexPath: string;
    since?: string;
    limit?: number;
    articleId?: string;
    contentTypes?: string[];
    domains?: string[];
    force: boolean;
    matched: number;
    missing: number;
    stale: number;
    fresh: number;
    alreadyTargetLanguage: number;
    selected: number;
  };
  execution: {
    translated: number;
    failed: number;
    skippedExisting: number;
    alreadyTargetLanguage: number;
  };
  metrics: {
    concurrency: number;
    elapsedMs: number;
    averageSecondsPerTranslatedArticle?: number;
    totalSourceCharactersSelected: number;
    totalApiRequests?: number;
    successfulApiRequests?: number;
    failedApiRequests?: number;
    retryRequests?: number;
    meanApiLatencyMs?: number;
    medianApiLatencyMs?: number;
    p90ApiLatencyMs?: number;
    maxApiLatencyMs?: number;
    medianArticleLatencyMs?: number;
    p90ArticleLatencyMs?: number;
    averageApiRequestsPerArticle?: number;
    averageBodyBatchesPerArticle?: number;
    charactersPerMinute?: number;
    successfulArticlesPerHour?: number;
    residueRepairRequests?: number;
    residueRepairSuccesses?: number;
    factualInvariantViolations?: number;
    factualRepairRequests?: number;
    factualRepairSuccesses?: number;
    truncationSplitEvents?: number;
    truncationSplitRecoveries?: number;
    minimumSplitBatchCharacters?: number;
    structuredOutputRecoveries?: number;
    singleSegmentFallbacks?: number;
    articlesWithOcrExcluded?: number;
    ocrCharactersSkipped?: number;
  };
  requestTelemetry?: Array<{
    articleId: string;
    purpose: string;
    sourceCharacters: number;
    segmentCount: number;
    startedAt: string;
    elapsedMs: number;
    success: boolean;
    retryAttempt: number;
    httpStatus?: number;
    responseCharacters?: number;
    splitDepth?: number;
    outcome?: string;
    details?: Record<string, unknown>;
  }>;
  items: TranslationBatchItem[];
};
