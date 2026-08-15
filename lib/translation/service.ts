import type { ArticleDetail } from "../knowledge-base/types";
import type { TranslationProvider } from "./provider";
import type { FileSystemTranslationRepository } from "./repository";
import type { TranslationRecord } from "./types";

type ArticleLoader = (id: string) => Promise<ArticleDetail | undefined>;

export type TranslationServiceResult =
  | {
      status: "translated";
      record: TranslationRecord;
      storagePath: string;
    }
  | {
      status: "skipped_existing";
      record: TranslationRecord;
      storagePath: string;
    };

function markdownUrls(markdown: string) {
  return markdown.match(/https?:\/\/[^\s<>"'`]+/g) ?? [];
}

/** Reject provider output if any URL changed, moved, appeared, or disappeared. */
export function assertMarkdownUrlsPreserved(source: string, translated: string) {
  const sourceUrls = markdownUrls(source);
  const translatedUrls = markdownUrls(translated);
  if (
    sourceUrls.length !== translatedUrls.length ||
    sourceUrls.some((url, index) => url !== translatedUrls[index])
  ) {
    throw new Error("Translation provider changed the Markdown URL sequence");
  }
}

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
        };
      }
    }

    const article = await this.loadArticle(articleId);
    if (!article) throw new Error(`Article ${articleId} was not found`);

    const translated = await this.provider.translateArticle({
      id: article.id,
      title: article.title,
      ...(article.digest === undefined ? {} : { digest: article.digest }),
      content: article.content,
      sourceLanguage: this.sourceLanguage,
      targetLanguage: this.targetLanguage,
    });
    const title = requireProviderText(translated.title, "title").trim();
    if (!title) throw new Error("Translation provider returned an empty title");
    const content = requireProviderText(translated.content, "content");
    assertMarkdownUrlsPreserved(article.content, content);

    let digest: string | undefined;
    if (article.digest !== undefined) {
      digest = requireProviderText(translated.digest, "digest").trim();
      if (!digest) {
        throw new Error("Translation provider returned an empty digest");
      }
    }

    const record: TranslationRecord = {
      version: 1,
      articleId: article.id,
      sourceLanguage: this.sourceLanguage,
      language: this.targetLanguage,
      title,
      ...(digest === undefined ? {} : { digest }),
      content,
      translatedAt: new Date().toISOString(),
      provider: this.provider.name,
      model: this.provider.model,
    };
    const storagePath = await this.repository.save(record);
    return { status: "translated" as const, record, storagePath };
  }
}
