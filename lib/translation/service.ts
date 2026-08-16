import type { ArticleDetail } from "../knowledge-base/types";
import type { TranslationProvider } from "./provider";
import type { FileSystemTranslationRepository } from "./repository";
import type { TranslationRecord } from "./types";
import { assertMarkdownUrlsPreserved } from "./markdown.ts";
import {
  detectMarkdownLanguage,
  type MarkdownLanguageClassification,
} from "./language.ts";
import {
  assertMarkdownStructurePreserved,
  assertNoSuspiciousChineseResidue,
} from "./validation.ts";

type ArticleLoader = (id: string) => Promise<ArticleDetail | undefined>;

export type TranslationServiceResult =
  | {
      status: "translated";
      record: TranslationRecord;
      storagePath: string;
      languageDetection: MarkdownLanguageClassification;
    }
  | {
      status: "skipped_existing";
      record: TranslationRecord;
      storagePath: string;
      languageDetection: MarkdownLanguageClassification;
    }
  | {
      status: "already_target_language";
      languageDetection: "clearly_en";
    };

export { assertMarkdownUrlsPreserved } from "./markdown.ts";

function requireProviderText(value: unknown, field: string) {
  if (typeof value !== "string") {
    throw new Error(`Translation provider returned an invalid ${field}`);
  }
  return value;
}

export class TranslationService {
  private readonly repository: FileSystemTranslationRepository;
  private readonly provider: TranslationProvider;
  private readonly loadArticle: ArticleLoader;
  private readonly sourceLanguage: string;
  private readonly targetLanguage: string;

  constructor(
    repository: FileSystemTranslationRepository,
    provider: TranslationProvider,
    loadArticle: ArticleLoader,
    sourceLanguage = "zh",
    targetLanguage = "en",
  ) {
    this.repository = repository;
    this.provider = provider;
    this.loadArticle = loadArticle;
    this.sourceLanguage = sourceLanguage;
    this.targetLanguage = targetLanguage;
  }

  async translateArticle(articleId: string, options: { force?: boolean } = {}) {
    const article = await this.loadArticle(articleId);
    if (!article) throw new Error(`Article ${articleId} was not found`);

    const language = detectMarkdownLanguage(article.content);
    if (
      language.classification === "clearly_en" &&
      this.targetLanguage.toLowerCase().startsWith("en")
    ) {
      return {
        status: "already_target_language" as const,
        languageDetection: language.classification,
      };
    }

    if (!options.force) {
      const existing = await this.repository.get(articleId, this.targetLanguage);
      if (existing) {
        return {
          status: "skipped_existing" as const,
          record: existing,
          storagePath: this.repository.translationPath(
            articleId,
            this.targetLanguage,
          ),
          languageDetection: language.classification,
        };
      }
    }

    // Ambiguous content keeps the historical zh source assumption so mixed or
    // short content is translated rather than incorrectly skipped.
    const effectiveSourceLanguage =
      language.classification === "clearly_en"
        ? "en"
        : language.classification === "clearly_zh"
          ? "zh"
          : this.sourceLanguage;

    const translated = await this.provider.translateArticle({
      id: article.id,
      title: article.title,
      ...(article.digest === undefined ? {} : { digest: article.digest }),
      content: article.content,
      sourceLanguage: effectiveSourceLanguage,
      targetLanguage: this.targetLanguage,
    });
    const title = requireProviderText(translated.title, "title").trim();
    if (!title) throw new Error("Translation provider returned an empty title");
    const content = requireProviderText(translated.content, "content");
    assertMarkdownUrlsPreserved(article.content, content);
    assertMarkdownStructurePreserved(article.content, content);

    let digest: string | undefined;
    if (article.digest !== undefined) {
      digest = requireProviderText(translated.digest, "digest").trim();
      if (!digest) {
        throw new Error("Translation provider returned an empty digest");
      }
    }

    // The mock intentionally echoes Chinese source text for pipeline testing;
    // target-language QA applies only to providers that claim to translate.
    if (
      this.provider.name !== "mock" &&
      this.targetLanguage.toLowerCase().startsWith("en")
    ) {
      assertNoSuspiciousChineseResidue(title, "title");
      if (digest !== undefined) {
        assertNoSuspiciousChineseResidue(digest, "digest");
      }
      assertNoSuspiciousChineseResidue(content, "content");
    }

    const record: TranslationRecord = {
      version: 1,
      articleId: article.id,
      sourceLanguage: effectiveSourceLanguage,
      language: this.targetLanguage,
      title,
      ...(digest === undefined ? {} : { digest }),
      content,
      translatedAt: new Date().toISOString(),
      provider: this.provider.name,
      model: this.provider.model,
    };
    const storagePath = await this.repository.save(record);
    return {
      status: "translated" as const,
      record,
      storagePath,
      languageDetection: language.classification,
    };
  }
}
