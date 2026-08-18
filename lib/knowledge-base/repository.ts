import { readFile } from "node:fs/promises";
import path from "node:path";
import { parseMarkdownDocument } from "./parser.mjs";
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
    article.sourceUrl,
    article.digest,
  ].every((field) => field === undefined || typeof field === "string");
  return (
    typeof article.id === "string" &&
    typeof article.title === "string" &&
    typeof article.account === "string" &&
    typeof article.relativePath === "string" &&
    optionalStringsAreValid &&
    (article.digestSource === "frontmatter" ||
      article.digestSource === "body_fallback" ||
      article.digestSource === "none")
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
    articlesById.set(value.id, value);
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
  if (!article.publishedAt) return undefined;
  const match = article.publishedAt.match(
    /^(\d{4})-(\d{2})-(\d{2})(?:T\d{2}:\d{2}(?::\d{2})?(?:Z|[+-]\d{2}:?\d{2})?)?$/,
  );
  if (!match) return undefined;
  const [, yearText, monthText, dayText] = match;
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  const calendarDate = new Date(Date.UTC(year, month - 1, day));
  if (
    calendarDate.getUTCFullYear() !== year ||
    calendarDate.getUTCMonth() !== month - 1 ||
    calendarDate.getUTCDate() !== day
  ) {
    return undefined;
  }
  const timestamp = Date.parse(article.publishedAt);
  return Number.isFinite(timestamp) ? timestamp : undefined;
}

function compareArticleSummaries(
  left: ArticleSummary,
  right: ArticleSummary,
) {
  const leftTimestamp = publishedTimestamp(left);
  const rightTimestamp = publishedTimestamp(right);

  if (leftTimestamp === undefined && rightTimestamp !== undefined) return 1;
  if (leftTimestamp !== undefined && rightTimestamp === undefined) return -1;
  if (leftTimestamp !== rightTimestamp) {
    return (rightTimestamp ?? 0) - (leftTimestamp ?? 0);
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
  const requestedPage = normalizedPositiveInteger(options.page, 1);
  const pageSize = normalizedPositiveInteger(options.pageSize, 18);
  const summaries = await loadSortedIndex();
  const matches = query
    ? summaries.filter((article) =>
        [article.title, article.digest, article.account, article.author]
          .filter((value): value is string => typeof value === "string")
          .some((value) => value.toLocaleLowerCase().includes(query)),
      )
    : [...summaries];

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
  return { ...summary, content: body.trim() };
}
