import { createHash } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type { ArticleDetail, ArticleSummary } from "./knowledge-base/types.ts";
import { getArticleById } from "./knowledge-base/repository.ts";
import { isEnglishSourceArticle } from "./article-detail-language.ts";
import { getTranslationStatus } from "./translation/status.ts";
import { enrichmentRootFromEnvironment } from "./translation/repository.ts";
import type { TranslationRecordV2 } from "./translation/types.ts";

/** Card metadata is intentionally separate from TranslationRecordV2. */
export const ARTICLE_CARD_TRANSLATION_VERSION = 1 as const;
export const ARTICLE_CARD_PROCESSING_VERSION = "article-card-v1";

export type ArticleCardTranslationRecord = {
  version: typeof ARTICLE_CARD_TRANSLATION_VERSION;
  articleId: string;
  sourceHash: string;
  language: "en";
  title: string;
  summary?: string;
  translatedAt: string;
  provider: string;
  model: string;
  processingVersion: typeof ARTICLE_CARD_PROCESSING_VERSION;
};

export type LocalizedArticleCard = {
  article: ArticleSummary;
  displayTitle: string;
  displaySummary?: string;
  footerText: string;
  readLabel: string;
  translationSource: "full-cache" | "card-cache" | "source-fallback" | "source";
};

export function articleCardSourceHash(article: Pick<ArticleSummary, "title" | "summary" | "digest">) {
  return createHash("sha256")
    .update(JSON.stringify({
      version: ARTICLE_CARD_PROCESSING_VERSION,
      title: article.title,
      summary: article.summary ?? article.digest ?? "",
    }))
    .digest("hex");
}

function safePathSegment(value: string, field: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/u.test(value) || value === "." || value === "..") {
    throw new Error(`${field} cannot be used as a storage path segment: ${value}`);
  }
  return value;
}

async function writeJsonAtomically(destination: string, value: unknown) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
}

function isCardTranslationRecord(value: unknown): value is ArticleCardTranslationRecord {
  if (value === null || typeof value !== "object") return false;
  const record = value as Partial<ArticleCardTranslationRecord>;
  return record.version === ARTICLE_CARD_TRANSLATION_VERSION &&
    typeof record.articleId === "string" &&
    typeof record.sourceHash === "string" && /^[a-f0-9]{64}$/u.test(record.sourceHash) &&
    record.language === "en" &&
    typeof record.title === "string" && record.title.trim().length > 0 &&
    (record.summary === undefined || typeof record.summary === "string") &&
    typeof record.translatedAt === "string" &&
    typeof record.provider === "string" &&
    typeof record.model === "string" &&
    record.processingVersion === ARTICLE_CARD_PROCESSING_VERSION;
}

export function validateArticleCardTranslationRecord(value: unknown): asserts value is ArticleCardTranslationRecord {
  if (!isCardTranslationRecord(value)) {
    throw new Error("Invalid article card translation record");
  }
}

export class FileSystemArticleCardTranslationRepository {
  readonly root: string;

  constructor(root = enrichmentRootFromEnvironment()) {
    this.root = path.resolve(root);
  }

  translationPath(articleId: string, language: "en" = "en") {
    return path.join(
      this.root,
      "article-card-translations",
      safePathSegment(language, "language"),
      `${safePathSegment(articleId, "articleId")}.json`,
    );
  }

  async get(articleId: string, language: "en" = "en") {
    try {
      const parsed = JSON.parse(await readFile(this.translationPath(articleId, language), "utf8")) as unknown;
      validateArticleCardTranslationRecord(parsed);
      if (parsed.articleId !== articleId || parsed.language !== language) return undefined;
      return parsed;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
      if (error instanceof SyntaxError || (error instanceof Error && /Invalid article card translation record/u.test(error.message))) return undefined;
      throw error;
    }
  }

  async save(record: ArticleCardTranslationRecord) {
    validateArticleCardTranslationRecord(record);
    const destination = this.translationPath(record.articleId, record.language);
    await writeJsonAtomically(destination, record);
    return destination;
  }
}

type FullTranslationLoader = (article: ArticleSummary) => Promise<TranslationRecordV2 | undefined>;

async function defaultFullTranslationLoader(article: ArticleSummary) {
  const detail = await getArticleById(article.id);
  if (!detail || isEnglishSourceArticle(detail)) return undefined;
  const status = await getTranslationStatus(article.id, { article: detail });
  return status.status === "fresh" && status.record?.version === 2 ? status.record : undefined;
}

function previewFromTranslatedBody(markdown: string | undefined) {
  if (!markdown) return undefined;
  const plain = markdown
    .replace(/!\[[^\]]*\]\([^\n)]*\)/gu, "")
    .replace(/\[([^\]]+)\]\([^\n)]*\)/gu, "$1")
    .replace(/^ {0,3}#{1,6}\s+/gmu, "")
    .replace(/[`*_~>#]/gu, "")
    .replace(/\s+/gu, " ")
    .trim();
  if (!plain) return undefined;
  return plain.length > 180 ? `${plain.slice(0, 179).trimEnd()}…` : plain;
}

function sourceSummary(article: ArticleSummary) {
  return article.summary ?? article.digest;
}

export type ResolveArticleCardsOptions = {
  cardRepository?: FileSystemArticleCardTranslationRepository;
  loadFullTranslation?: FullTranslationLoader;
};

/**
 * Resolve card text without invoking a translation provider.  Full V2 caches
 * take precedence over the independent card cache; stale/malformed caches are
 * ignored and the source metadata remains a safe fallback.
 */
export async function resolveArticleCard(
  article: ArticleSummary,
  language: "zh" | "en",
  options: ResolveArticleCardsOptions = {},
): Promise<LocalizedArticleCard> {
  const english = language === "en";
  const sourceText = sourceSummary(article);
  const labels = {
    read: english ? "Read article →" : "阅读全文 →",
    footer: article.author
      ? (english ? `Author: ${article.author}` : `作者：${article.author}`)
      : article.account || (english ? "Knowledge Base" : "真实知识库"),
  };
  if (!english) {
    return { article, displayTitle: article.title, displaySummary: sourceText, footerText: labels.footer, readLabel: labels.read, translationSource: "source" };
  }

  let full: TranslationRecordV2 | undefined;
  try {
    full = await (options.loadFullTranslation ?? defaultFullTranslationLoader)(article);
  } catch {
    // A missing Markdown root/cache must not break metadata browsing.
  }
  if (full) {
    return {
      article,
      displayTitle: full.title,
      displaySummary: full.summary ?? full.digest ?? previewFromTranslatedBody(full.content) ?? sourceText,
      footerText: labels.footer,
      readLabel: labels.read,
      translationSource: "full-cache",
    };
  }

  let card: ArticleCardTranslationRecord | undefined;
  try {
    card = await (options.cardRepository ?? new FileSystemArticleCardTranslationRepository()).get(article.id);
  } catch {
    card = undefined;
  }
  if (card && card.sourceHash === articleCardSourceHash(article)) {
    return {
      article,
      displayTitle: card.title,
      displaySummary: card.summary ?? sourceText,
      footerText: labels.footer,
      readLabel: labels.read,
      translationSource: "card-cache",
    };
  }

  return {
    article,
    displayTitle: article.title,
    displaySummary: sourceText,
    footerText: labels.footer,
    readLabel: labels.read,
    translationSource: "source-fallback",
  };
}

export async function resolveArticleCards(
  articles: readonly ArticleSummary[],
  language: "zh" | "en",
  options: ResolveArticleCardsOptions = {},
) {
  return Promise.all(articles.map((article) => resolveArticleCard(article, language, options)));
}
