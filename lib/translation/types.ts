import type { ArticleDetail } from "../knowledge-base/types";

export type TranslationLanguage = string;

export type TranslationRecord = {
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

export type TranslationProviderInput = Pick<
  ArticleDetail,
  "id" | "title" | "digest" | "content"
> & {
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
};

export type TranslationProviderOutput = Pick<
  TranslationRecord,
  "title" | "digest" | "content"
>;

export type TranslationItemStatus =
  | "translated"
  | "skipped_existing"
  | "failed";

export type TranslationBatchItem = {
  articleId: string;
  title: string;
  publishedAt?: string;
  status: TranslationItemStatus;
  storagePath?: string;
  error?: string;
};

export type TranslationBatchReport = {
  version: 1;
  runId: string;
  startedAt: string;
  completedAt: string;
  sourceLanguage: TranslationLanguage;
  targetLanguage: TranslationLanguage;
  provider: string;
  model: string;
  selection: {
    indexPath: string;
    since: string;
    limit: number;
    force: boolean;
    matched: number;
    selected: number;
  };
  counts: {
    translated: number;
    skippedExisting: number;
    failed: number;
  };
  items: TranslationBatchItem[];
};
