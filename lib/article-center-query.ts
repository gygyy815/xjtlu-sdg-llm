import { normalizeSdgGoal } from "./knowledge-base/sdg-goals.ts";

export const ARTICLE_TIME_RANGES = [
  "all",
  "30d",
  "3m",
  "6m",
  "1y",
  "2026",
  "2025",
  "2024",
  "2023",
  "2022",
  "2021",
  "2020",
  "2019",
  "2018",
  "2017",
  "2016",
  "2015",
  "2014",
] as const;

/** Publication years exposed by the Article Center year picker. */
export const ARTICLE_YEARS = [
  "2026",
  "2025",
  "2024",
  "2023",
  "2022",
  "2021",
  "2020",
  "2019",
  "2018",
  "2017",
  "2016",
  "2015",
  "2014",
] as const;

export type ArticleYear = (typeof ARTICLE_YEARS)[number];

export type ArticleTimeRange = (typeof ARTICLE_TIME_RANGES)[number];
export type ArticleSort = "newest" | "oldest";

export type ArticleDateBounds = {
  publishedAfter?: string;
  publishedBefore?: string;
};

export type ArticleCenterQuery = {
  language?: "en" | "zh";
  q?: string;
  knowledgeDomain?: string;
  organizationUnit?: string;
  sourceAccount?: string;
  contentType?: string;
  sdgGoal?: string;
  timeRange?: ArticleTimeRange;
  sort?: ArticleSort;
  years?: readonly string[];
  page?: number;
};

/**
 * Build a stable query string for Article Center links.  Detail links use the
 * same fields as the list so that returning to the browser preserves the
 * user's language and filters.
 */
function articleCenterQueryParams({
  language = "zh",
  q = "",
  knowledgeDomain = "",
  organizationUnit = "",
  sourceAccount = "",
  contentType = "",
  sdgGoal = "",
  timeRange = "all",
  sort = "newest",
  years = [],
  page = 1,
}: ArticleCenterQuery) {
  const params = new URLSearchParams();
  if (language === "en") params.set("lang", "en");
  if (q) params.set("q", q);
  if (knowledgeDomain) params.set("domain", knowledgeDomain);
  if (sourceAccount) params.set("org", sourceAccount);
  else if (organizationUnit) params.set("org", organizationUnit);
  if (contentType) params.set("type", contentType);
  const normalizedSdgGoal = normalizeSdgGoal(sdgGoal);
  if (normalizedSdgGoal) params.set("sdg", normalizedSdgGoal);
  if (timeRange !== "all") params.set("time", timeRange);
  if (sort !== "newest") params.set("sort", sort);
  const normalizedYears = normalizeArticleYears(years);
  if (normalizedYears.length) params.set("year", normalizedYears.join(","));
  if (page > 1) params.set("page", String(page));
  return params;
}

export function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseArticleCenterPage(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function resolveArticleTimeRangeParam(
  value: string | string[] | undefined,
): ArticleTimeRange {
  const candidate = firstSearchParam(value);
  return ARTICLE_TIME_RANGES.includes(candidate as ArticleTimeRange)
    ? (candidate as ArticleTimeRange)
    : "all";
}

/** Normalize repeated or comma-separated year query values for the UI picker. */
export function resolveArticleYearParams(
  value: string | string[] | undefined,
): ArticleYear[] {
  const values = (Array.isArray(value) ? value : value ? [value] : [])
    .flatMap((item) => item.split(","))
    .map((item) => item.trim())
    .filter((item): item is ArticleYear => ARTICLE_YEARS.includes(item as ArticleYear));
  return [...new Set(values)];
}

export function normalizeArticleYears(
  years: readonly string[] | undefined,
): ArticleYear[] {
  return resolveArticleYearParams(years?.join(","));
}

export function resolveArticleSortParam(
  value: string | string[] | undefined,
): ArticleSort {
  return firstSearchParam(value) === "oldest" ? "oldest" : "newest";
}

function datePartsInCampusTime(value: Date) {
  const parts = new Intl.DateTimeFormat("en", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(value);
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return {
    year: Number(values.year),
    month: Number(values.month),
    day: Number(values.day),
  };
}

function dateOnly(value: Date) {
  const parts = datePartsInCampusTime(value);
  return `${String(parts.year).padStart(4, "0")}-${String(parts.month).padStart(2, "0")}-${String(parts.day).padStart(2, "0")}`;
}

function shiftCampusDate(value: Date, { days = 0, months = 0 }: { days?: number; months?: number }) {
  const parts = datePartsInCampusTime(value);
  const shifted = new Date(Date.UTC(parts.year, parts.month - 1, parts.day));
  if (months) shifted.setUTCMonth(shifted.getUTCMonth() + months);
  if (days) shifted.setUTCDate(shifted.getUTCDate() + days);
  return shifted.toISOString().slice(0, 10);
}

export function articleTimeRangeBounds(
  timeRange: ArticleTimeRange = "all",
  now = new Date(),
): ArticleDateBounds {
  const today = dateOnly(now);
  if (timeRange === "all") return {};
  if (timeRange === "30d") return { publishedAfter: shiftCampusDate(now, { days: -30 }), publishedBefore: today };
  if (timeRange === "3m") return { publishedAfter: shiftCampusDate(now, { months: -3 }), publishedBefore: today };
  if (timeRange === "6m") return { publishedAfter: shiftCampusDate(now, { months: -6 }), publishedBefore: today };
  if (timeRange === "1y") return { publishedAfter: shiftCampusDate(now, { months: -12 }), publishedBefore: today };
  return { publishedAfter: `${timeRange}-01-01`, publishedBefore: `${timeRange}-12-31` };
}

export function resolveKnowledgeDomainParam(
  domain: string | string[] | undefined,
  legacyKb: string | string[] | undefined,
) {
  return firstSearchParam(domain) ?? firstSearchParam(legacyKb);
}

export function resolveSdgGoalParam(value: string | string[] | undefined) {
  return normalizeSdgGoal(firstSearchParam(value));
}

export function articleCenterHref({
  language = "zh",
  q = "",
  knowledgeDomain = "",
  organizationUnit = "",
  sourceAccount = "",
  contentType = "",
  sdgGoal = "",
  timeRange = "all",
  sort = "newest",
  years = [],
  page = 1,
}: ArticleCenterQuery) {
  const params = articleCenterQueryParams({ language, q, knowledgeDomain, organizationUnit, sourceAccount, contentType, sdgGoal, timeRange, sort, years, page });
  const query = params.toString();
  return query ? `/articles?${query}` : "/articles";
}

/** Build an Article Center detail URL while preserving the current list state. */
export function articleDetailHref(articleId: string, query: ArticleCenterQuery = {}) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(articleId)) {
    throw new Error(`Invalid article id: ${articleId}`);
  }
  const params = articleCenterQueryParams(query);
  const serialized = params.toString();
  return serialized ? `/articles/${articleId}?${serialized}` : `/articles/${articleId}`;
}
