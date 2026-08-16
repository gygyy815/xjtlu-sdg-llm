import type { ArticleDetail } from "./knowledge-base/types";
import { removeWechatRecommendationFooterForDisplay } from "./article-recommendation-footer.ts";

type ArticleDisplaySource = Pick<
  ArticleDetail,
  "content" | "title" | "author" | "account" | "publishedAt" | "sourceUrl"
>;

type SourceLine = {
  start: number;
  text: string;
};

export type ArticleMarkdownDisplayOptions = {
  translatedContent?: boolean;
};

function decodeBasicHtmlEntities(value: string) {
  return value
    .replace(/&amp;/gi, "&")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">");
}

function plainMarkdownText(value: string) {
  return decodeBasicHtmlEntities(value)
    .replace(/!\[([^\]]*)\]\([^\n)]*\)/g, "$1")
    .replace(/\[([^\]]+)\]\([^\n)]*\)/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/\\([\\`*_[\]{}()#+.!<>~-])/g, "$1")
    .replace(/[`*_~]+/g, "")
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function sourceLines(source: string): SourceLine[] {
  const lines: SourceLine[] = [];
  let start = 0;

  while (start < source.length) {
    let end = start;
    while (end < source.length && source[end] !== "\n" && source[end] !== "\r") {
      end += 1;
    }
    lines.push({ start, text: source.slice(start, end) });
    if (source[end] === "\r" && source[end + 1] === "\n") end += 2;
    else if (end < source.length) end += 1;
    start = end;
  }

  return lines;
}

function skipBlankLines(lines: SourceLine[], start: number) {
  let index = start;
  while (index < lines.length && lines[index].text.trim() === "") index += 1;
  return index;
}

function leadingH1(lines: SourceLine[], start: number) {
  const line = lines[start]?.text;
  if (line === undefined) return undefined;

  const atxHeading = line.match(/^ {0,3}#(?:[ \t]+|$)(.*)$/);
  if (atxHeading) {
    return {
      end: start + 1,
      text: atxHeading[1].replace(/[ \t]+#+[ \t]*$/, ""),
    };
  }

  if (
    line.trim() &&
    lines[start + 1]?.text.match(/^ {0,3}=+[ \t]*$/)
  ) {
    return { end: start + 2, text: line.trim() };
  }

  return undefined;
}

function leadingBlockquote(lines: SourceLine[], start: number) {
  const content: string[] = [];
  let index = start;

  while (index < lines.length) {
    const match = lines[index].text.match(/^ {0,3}>[ \t]?(.*)$/);
    if (!match) break;
    content.push(match[1]);
    index += 1;
  }

  return content.length ? { content, end: index } : undefined;
}

const ENGLISH_TITLE_STOP_WORDS = new Set([
  "a",
  "an",
  "and",
  "at",
  "for",
  "from",
  "he",
  "her",
  "his",
  "in",
  "is",
  "of",
  "on",
  "she",
  "the",
  "to",
  "was",
  "with",
]);

function englishTitleTokens(value: string) {
  return new Set(
    (plainMarkdownText(value).match(/\p{Script=Latin}+/gu) ?? []).filter(
      (token) => !ENGLISH_TITLE_STOP_WORDS.has(token),
    ),
  );
}

function isHighConfidenceTranslatedTitleMatch(
  heading: string,
  structuredTitle: string,
) {
  const headingTokens = englishTitleTokens(heading);
  const titleTokens = englishTitleTokens(structuredTitle);
  if (headingTokens.size < 5 || titleTokens.size < 5) return false;

  const shared = [...headingTokens].filter((token) =>
    titleTokens.has(token),
  ).length;
  const smaller = Math.min(headingTokens.size, titleTokens.size);
  const larger = Math.max(headingTokens.size, titleTokens.size);
  return shared >= 4 && shared / smaller >= 0.65 && shared / larger >= 0.45;
}

function publishedAtVariants(publishedAt: string) {
  const normalized = publishedAt.trim();
  const match = normalized.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:[T ](\d{2}):(\d{2}))?/,
  );
  if (!match) return [plainMarkdownText(normalized)];

  const [, year, month, day, hour, minute] = match;
  const date = `${year}-${month}-${day}`;
  const variants = [
    date,
    `${year}/${month}/${day}`,
    `${year}年${Number(month)}月${Number(day)}日`,
    `${year}年${month}月${day}日`,
  ];
  if (hour && minute) variants.push(`${date} ${hour}:${minute}`);
  return variants.map(plainMarkdownText);
}

function isAttributionBlockquote(
  content: string[],
  article: ArticleDisplaySource,
) {
  if (content.length > 3) return false;
  const quote = plainMarkdownText(content.join(" "));
  if (!quote || quote.length > 300) return false;

  const matchedValues = new Set<string>();
  for (const value of [article.author, article.account]) {
    if (!value) continue;
    const normalized = plainMarkdownText(value);
    if (normalized && quote.includes(normalized)) matchedValues.add(normalized);
  }

  let matchedDate = false;
  if (article.publishedAt) {
    const matchingDate = publishedAtVariants(article.publishedAt).find(
      (variant) => variant && quote.includes(variant),
    );
    if (matchingDate) {
      matchedValues.add(matchingDate);
      matchedDate = true;
    }
  }

  const hasAttributionLayout =
    matchedDate ||
    /(?:·|•|\||｜|—|–|作者[：:]|公众号[：:]|来源[：:]|发布[：:])/u.test(quote);
  return matchedValues.size >= 2 && hasAttributionLayout;
}

function comparableHttpUrl(value: string) {
  try {
    const parsed = new URL(decodeBasicHtmlEntities(value.trim()));
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") return undefined;
    parsed.hash = "";
    return parsed.href;
  } catch {
    return undefined;
  }
}

function isMatchingSourceLinkBlockquote(
  content: string[],
  sourceUrl: string | undefined,
) {
  if (!sourceUrl) return false;
  const block = content.join("\n").trim();
  const link = block.match(
    /^\[([^\]]+)\]\(\s*(?:<([^>]+)>|([^\s)]+))(?:\s+(?:"[^"]*"|'[^']*'|\([^)]*\)))?\s*\)$/,
  );
  if (!link) return false;

  const label = plainMarkdownText(link[1]);
  if (
    !/^(?:原文链接|阅读原文|查看原文|微信原文|original link|read original|view original|source link)$/.test(
      label,
    )
  ) {
    return false;
  }

  const linkedUrl = comparableHttpUrl(link[2] ?? link[3]);
  const articleUrl = comparableHttpUrl(sourceUrl);
  return linkedUrl !== undefined && linkedUrl === articleUrl;
}

/**
 * Remove redundant, leading presentation elements from a real article body.
 * The returned string is a suffix of the source so content after the removed
 * prefix keeps its exact characters and line endings.
 */
export function normalizeArticleMarkdownForDisplay(
  article: ArticleDisplaySource,
  options: ArticleMarkdownDisplayOptions = {},
) {
  const { content } = article;
  const lines = sourceLines(content);
  let cursor = skipBlankLines(lines, 0);
  let removedPrefix = false;

  const heading = leadingH1(lines, cursor);
  if (heading) {
    const afterHeading = skipBlankLines(lines, heading.end);
    const followingBlockquote = leadingBlockquote(lines, afterHeading);
    const followedByPresentationMetadata =
      followingBlockquote !== undefined &&
      (isAttributionBlockquote(followingBlockquote.content, article) ||
        isMatchingSourceLinkBlockquote(
          followingBlockquote.content,
          article.sourceUrl,
        ));
    const exactTitleMatch =
      plainMarkdownText(heading.text) === plainMarkdownText(article.title);
    const translatedTitleMatch =
      options.translatedContent === true &&
      (followedByPresentationMetadata ||
        isHighConfidenceTranslatedTitleMatch(heading.text, article.title));

    if (exactTitleMatch || translatedTitleMatch) {
      cursor = afterHeading;
      removedPrefix = true;
    }
  }

  while ((heading === undefined || removedPrefix) && cursor < lines.length) {
    const blockquote = leadingBlockquote(lines, cursor);
    if (!blockquote) break;

    const removable =
      isAttributionBlockquote(blockquote.content, article) ||
      isMatchingSourceLinkBlockquote(blockquote.content, article.sourceUrl);
    if (!removable) break;

    cursor = skipBlankLines(lines, blockquote.end);
    removedPrefix = true;
  }

  const withoutLeadingPresentation = removedPrefix
    ? cursor < lines.length
      ? content.slice(lines[cursor].start)
      : ""
    : content;
  return removeWechatRecommendationFooterForDisplay(
    withoutLeadingPresentation,
  );
}

/** Format normalized article dates without changing their stored value or zone. */
export function formatArticlePublishedAt(publishedAt: string) {
  const match = publishedAt.trim().match(
    /^(\d{4}-\d{2}-\d{2})[T ](\d{2}:\d{2})(?::\d{2}(?:\.\d+)?)?(?:Z|[+-]\d{2}:?\d{2})?$/,
  );
  return match ? `${match[1]} ${match[2]}` : publishedAt;
}
