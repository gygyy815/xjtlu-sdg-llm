import type { ArticleDetail } from "../knowledge-base/types.ts";
import { buildTranslationView } from "./preprocessor.ts";
import { TRANSLATION_GLOSSARY } from "./terminology.ts";

/**
 * A deliberately conservative, provider-free English preview.  It is never
 * written to the validated cache: unknown Chinese is left intact rather than
 * guessed, while official glossary names and a few stable UI phrases are
 * translated so the page can render immediately while the worker runs.
 */
const SAFE_PHRASES: readonly [string, string][] = [
  ["文章摘要", "Summary"],
  ["通知", "Notice"],
  ["活动", "Activity"],
  ["讲座", "Lecture"],
  ["招聘", "Recruitment"],
  ["报名", "Registration"],
  ["校园招聘", "Campus recruitment"],
  ["学术交流", "Academic exchange"],
  ["欢迎", "Welcome"],
  ["喜报", "Good news"],
  ["原文链接", "Original article"],
];

function replaceKnownTerms(value: string) {
  let result = value;
  for (const { source, target } of TRANSLATION_GLOSSARY) {
    result = result.split(source).join(target);
  }
  for (const [source, target] of SAFE_PHRASES) {
    result = result.split(source).join(target);
  }
  return result;
}

export type InstantEnglishPreview = {
  article: ArticleDetail;
  provider: "instant-fallback";
  validated: false;
};

export function buildInstantEnglishPreview(article: ArticleDetail): InstantEnglishPreview {
  const view = buildTranslationView(article.content, { articleId: article.id });
  const translations = new Map(view.segments.map((segment) => [segment.id, replaceKnownTerms(segment.text)]));
  return {
    provider: "instant-fallback",
    validated: false,
    article: {
      ...article,
      title: replaceKnownTerms(article.title),
      ...(article.summary !== undefined ? { summary: replaceKnownTerms(article.summary) } : {}),
      ...(article.digest !== undefined ? { digest: replaceKnownTerms(article.digest) } : {}),
      content: view.reconstruct(translations),
    },
  };
}

