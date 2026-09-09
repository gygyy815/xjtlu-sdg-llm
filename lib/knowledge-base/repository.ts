import { readFile } from "node:fs/promises";
import path from "node:path";
import { loadClassificationIndex } from "../classification/repository.ts";
import { organizationUnitForAccount } from "../classification/organization-units.ts";
import {
  articleTimeRangeBounds,
  normalizeArticleYears,
  resolveArticleSortParam,
  resolveArticleTimeRangeParam,
} from "../article-center-query.ts";
import { parseMarkdownDocument } from "./parser.mjs";
import { normalizeTrustedDate } from "./article-date.mjs";
import {
  normalizeEnrichedSummary,
  normalizeSdgTags,
} from "./sdg-metadata.mjs";
import { normalizeSdgGoal, sdgCodeMatchesGoal } from "./sdg-goals.ts";
import { resolveArticleSourceUrl } from "./source-url.ts";
import type {
  ArticleDetail,
  ArticleSummary,
  ArticleSummarySearchOptions,
  ArticleSummarySearchResult,
} from "./types";

export type {
  ArticleDetail,
  ArticleSummary,
  ArticleSummarySearchOptions,
  ArticleSummarySearchResult,
} from "./types";

let indexPromise: Promise<ReadonlyMap<string, ArticleSummary>> | undefined;
let sortedIndexPromise: Promise<readonly ArticleSummary[]> | undefined;

function projectRoot() {
  return path.resolve(process.env.PROJECT_ROOT?.trim() || process.cwd());
}

function indexPath() {
  const configuredPath = process.env.KB_INDEX_PATH?.trim();
  return configuredPath
    ? path.resolve(configuredPath)
    : path.join(projectRoot(), "data/full-kb-index.json");
}

function markdownRoot() {
  const configuredRoot = process.env.KB_MARKDOWN_ROOT?.trim();
  if (!configuredRoot) {
    throw new Error(
      "KB_MARKDOWN_ROOT is required to load full article content",
    );
  }
  return path.resolve(configuredRoot);
}

function isArticleSummary(value: unknown): value is ArticleSummary {
  if (value === null || typeof value !== "object") return false;
  const article = value as Partial<ArticleSummary>;
  const optionalStringsAreValid = [
    article.author,
    article.publishedAt,
    article.publishedAtSource,
    article.publishedAtConfidence,
    article.sourceUrl,
    article.digest,
    article.summary,
  ].every((field) => field === undefined || typeof field === "string");
  return (
    typeof article.id === "string" &&
    typeof article.title === "string" &&
    typeof article.account === "string" &&
    typeof article.relativePath === "string" &&
    optionalStringsAreValid &&
    (article.digestSource === "frontmatter" ||
      article.digestSource === "body_fallback" ||
      article.digestSource === "none") &&
    (article.publishedAtSource === undefined ||
      ["frontmatter", "export_metadata", "canonical_metadata", "filename_convention", "title_prefix", "unknown"].includes(article.publishedAtSource)) &&
    (article.publishedAtConfidence === undefined ||
      ["high", "medium", "low", "unknown"].includes(article.publishedAtConfidence))
  );
}

async function readIndex(): Promise<ReadonlyMap<string, ArticleSummary>> {
  const sourcePath = indexPath();
  let parsed: unknown;

  try {
    parsed = JSON.parse(await readFile(sourcePath, "utf8"));
  } catch (error) {
    const code = error && typeof error === "object" && "code" in error ? String((error as { code?: unknown }).code) : "";
    const usingOptionalDefaultIndex = !process.env.KB_INDEX_PATH?.trim();
    if (code === "ENOENT" && usingOptionalDefaultIndex) {
      return new Map<string, ArticleSummary>();
    }
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not load article index at ${sourcePath}: ${message}`);
  }

  if (!Array.isArray(parsed)) {
    throw new Error(`Article index at ${sourcePath} must contain a JSON array`);
  }

  const articlesById = new Map<string, ArticleSummary>();
  const classifications = await loadClassificationIndex();
  for (const [position, value] of parsed.entries()) {
    if (!isArticleSummary(value)) {
      throw new Error(
        `Article index at ${sourcePath} has an invalid entry at position ${position}`,
      );
    }
    if (articlesById.has(value.id)) {
      throw new Error(
        `Article index at ${sourcePath} contains duplicate id ${value.id}`,
      );
    }
    const summary = normalizeEnrichedSummary(value.summary);
    const sdgTags = normalizeSdgTags(value.sdgTags);
    const sourceSummary: ArticleSummary = {
      id: value.id,
      title: value.title,
      account: value.account,
      digestSource: value.digestSource,
      relativePath: value.relativePath,
      ...(value.author ? { author: value.author } : {}),
      ...(value.publishedAt ? { publishedAt: value.publishedAt } : {}),
      ...(value.publishedAtSource ? { publishedAtSource: value.publishedAtSource } : {}),
      ...(value.publishedAtConfidence ? { publishedAtConfidence: value.publishedAtConfidence } : {}),
      ...(value.sourceUrl ? { sourceUrl: value.sourceUrl } : {}),
      ...(value.digest ? { digest: value.digest } : {}),
      ...(summary ? { summary } : {}),
      ...(sdgTags ? { sdgTags } : {}),
    };
    const classification = classifications.get(value.id);
    const organizationUnit =
      classification?.organizationUnit ?? organizationUnitForAccount(value.account);
    articlesById.set(
      value.id,
      {
        ...sourceSummary,
        ...(organizationUnit ? { organizationUnit } : {}),
        ...(classification?.primaryDomain
          ? { primaryDomain: classification.primaryDomain }
          : {}),
        ...(classification
          ? { secondaryDomains: [...classification.secondaryDomains] }
          : {}),
        ...(classification?.contentType
          ? { contentType: classification.contentType }
          : {}),
      },
    );
  }

  return articlesById;
}

/** Load and process the server-side metadata index once per module instance. */
export function loadIndex(): Promise<ReadonlyMap<string, ArticleSummary>> {
  indexPromise ??= readIndex();
  return indexPromise;
}

export async function getArticleSummaryById(
  id: string,
): Promise<ArticleSummary | undefined> {
  return (await loadIndex()).get(id);
}

function normalizedPositiveInteger(value: number | undefined, fallback: number) {
  return Number.isSafeInteger(value) && (value ?? 0) > 0 ? value! : fallback;
}

function publishedTimestamp(article: ArticleSummary) {
  const normalized = normalizeTrustedDate(article.publishedAt);
  if (!normalized) return undefined;
  const timestamp = Date.parse(normalized);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function compareArticleSummaries(
  left: ArticleSummary,
  right: ArticleSummary,
  sort: "newest" | "oldest" = "newest",
) {
  const leftTimestamp = publishedTimestamp(left);
  const rightTimestamp = publishedTimestamp(right);

  if (leftTimestamp === undefined && rightTimestamp !== undefined) return 1;
  if (leftTimestamp !== undefined && rightTimestamp === undefined) return -1;
  if (leftTimestamp !== rightTimestamp) {
    return sort === "oldest"
      ? (leftTimestamp ?? 0) - (rightTimestamp ?? 0)
      : (rightTimestamp ?? 0) - (leftTimestamp ?? 0);
  }
  return left.id.localeCompare(right.id, "en");
}

function loadSortedIndex() {
  sortedIndexPromise ??= loadIndex().then((index) =>
    [...index.values()].sort(compareArticleSummaries),
  );
  return sortedIndexPromise;
}

/**
 * Search the cached metadata index without reading article Markdown bodies.
 * Results are newest-first; missing or invalid dates sort after dated entries.
 */
export async function searchArticleSummaries(
  options: ArticleSummarySearchOptions = {},
): Promise<ArticleSummarySearchResult> {
  const query = options.q?.trim().toLocaleLowerCase() ?? "";
  const knowledgeDomain = options.knowledgeDomain?.trim() ?? "";
  const organizationUnit = options.organizationUnit?.trim() ?? "";
  const sourceAccount = options.sourceAccount?.trim() ?? "";
  const contentType = options.contentType?.trim() ?? "";
  const sdgGoal = normalizeSdgGoal(options.sdgGoal);
  const timeRange = resolveArticleTimeRangeParam(options.timeRange);
  const publicationYears = normalizeArticleYears(options.publicationYears);
  const sort = resolveArticleSortParam(options.sort);
  const requestedNow = options.now ? new Date(options.now) : new Date();
  const now = Number.isNaN(requestedNow.getTime()) ? new Date() : requestedNow;
  const timeBounds = articleTimeRangeBounds(timeRange, now);
  const requestedPage = normalizedPositiveInteger(options.page, 1);
  const pageSize = normalizedPositiveInteger(options.pageSize, 18);
  const summaries = await loadSortedIndex();
  const matches = summaries.filter((article) => {
    const matchesQuery =
      !query ||
      [article.title, article.summary, article.digest, article.account, article.author]
        .filter((value): value is string => typeof value === "string")
        .some((value) => value.toLocaleLowerCase().includes(query));
    const matchesKnowledgeDomain =
      !knowledgeDomain ||
      article.primaryDomain === knowledgeDomain ||
      article.secondaryDomains?.includes(
        knowledgeDomain as NonNullable<ArticleSummary["secondaryDomains"]>[number],
      ) === true;
    const matchesOrganization =
      !organizationUnit || article.organizationUnit === organizationUnit;
    const matchesSourceAccount =
      !sourceAccount || article.account === sourceAccount;
    const matchesContentType =
      !contentType || article.contentType === contentType;
    const matchesSdgGoal =
      !sdgGoal ||
      article.sdgTags?.some(({ code }) => sdgCodeMatchesGoal(code, sdgGoal)) === true;
    const publishedDate = normalizeTrustedDate(article.publishedAt)?.slice(0, 10);
    const matchesTimeRange =
      timeRange === "all" ||
      (publishedDate !== undefined &&
        (timeBounds.publishedAfter === undefined || publishedDate >= timeBounds.publishedAfter) &&
        (timeBounds.publishedBefore === undefined || publishedDate <= timeBounds.publishedBefore));
    const matchesPublicationYear =
      publicationYears.length === 0 ||
      (publishedDate !== undefined && publicationYears.some((year) => year === publishedDate.slice(0, 4)));
    return (
      matchesQuery &&
      matchesKnowledgeDomain &&
      matchesOrganization &&
      matchesSourceAccount &&
      matchesContentType &&
      matchesSdgGoal &&
      matchesTimeRange &&
      matchesPublicationYear
    );
  }).sort((left, right) => compareArticleSummaries(left, right, sort));

  const total = matches.length;
  const totalPages = Math.ceil(total / pageSize);
  const page = totalPages === 0 ? 1 : Math.min(requestedPage, totalPages);
  const start = (page - 1) * pageSize;

  return {
    items: matches.slice(start, start + pageSize),
    total,
    page,
    pageSize,
    totalPages,
  };
}

function resolveArticlePath(root: string, relativePath: string) {
  const candidate = path.resolve(root, relativePath);
  const relative = path.relative(root, candidate);
  if (
    relative === ".." ||
    relative.startsWith(`..${path.sep}`) ||
    path.isAbsolute(relative)
  ) {
    throw new Error(`Article path escapes KB_MARKDOWN_ROOT: ${relativePath}`);
  }
  return candidate;
}

export async function getArticleById(
  id: string,
): Promise<ArticleDetail | undefined> {
  const summary = await getArticleSummaryById(id);
  if (!summary) return undefined;

  const root = markdownRoot();
  const sourcePath = resolveArticlePath(root, summary.relativePath);
  let source: string;
  try {
    source = await readFile(sourcePath, "utf8");
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not read article ${id} at ${sourcePath}: ${message}`);
  }

  const { body } = parseMarkdownDocument(source);
  const content = body.trim();
  const sourceResolution = resolveArticleSourceUrl({
    structuredSourceUrl: summary.sourceUrl,
    markdown: content,
  });
  if (sourceResolution.conflict) {
    console.warn(
      `[article-source] conflicting explicit source URLs for ${id}: ${sourceResolution.candidates.join(", ")}`,
    );
  }
  // Never expose an invalid structured value to the UI. The resolver either
  // supplies a validated URL or leaves the field absent so the detail page
  // can show its intentional missing-link state.
  const { sourceUrl: _invalidOrUnresolvedSourceUrl, ...summaryWithoutSourceUrl } = summary;
  return {
    ...summaryWithoutSourceUrl,
    ...(sourceResolution.sourceUrl ? { sourceUrl: sourceResolution.sourceUrl } : {}),
    content,
  };
}
