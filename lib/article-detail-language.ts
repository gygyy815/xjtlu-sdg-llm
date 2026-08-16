import type { ArticleDetail } from "./knowledge-base/types.ts";
import { detectMarkdownLanguage } from "./translation/language.ts";
import type { TranslationRecord } from "./translation/types.ts";

export type ArticleDetailLanguageState = {
  requestedEnglish: boolean;
  englishAvailable: boolean;
  sourceIsEnglish: boolean;
  displayArticle?: ArticleDetail;
};

export function isEnglishSourceArticle(article: ArticleDetail) {
  return detectMarkdownLanguage(article.content).classification === "clearly_en";
}

/**
 * Select already-stored article text for the detail page.
 *
 * This function is deliberately provider-free: it can only choose the source
 * article or a translation record that the server has already read.
 */
export function resolveArticleDetailLanguage(
  article: ArticleDetail,
  translation: TranslationRecord | undefined,
  requestedEnglish: boolean,
  sourceIsEnglish = isEnglishSourceArticle(article),
): ArticleDetailLanguageState {
  const englishAvailable = sourceIsEnglish || translation !== undefined;

  if (!requestedEnglish) {
    return {
      requestedEnglish,
      englishAvailable,
      sourceIsEnglish,
      displayArticle: article,
    };
  }

  if (sourceIsEnglish) {
    return {
      requestedEnglish,
      englishAvailable,
      sourceIsEnglish,
      displayArticle: article,
    };
  }

  if (!translation) {
    return {
      requestedEnglish,
      englishAvailable,
      sourceIsEnglish,
    };
  }

  return {
    requestedEnglish,
    englishAvailable,
    sourceIsEnglish,
    displayArticle: {
      ...article,
      title: translation.title,
      digest: translation.digest,
      content: translation.content,
    },
  };
}
