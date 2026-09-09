const DATE_PARTS = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})$/u;
const COMPACT_DATE = /^(\d{4})(\d{2})(\d{2})$/u;
const CHINESE_DATE = /^(\d{4})年(\d{1,2})月(\d{1,2})日(?:\s*(\d{1,2}):(\d{2})(?::(\d{2}))?)?$/u;
const DATE_TIME = /^(\d{4})[-/.](\d{1,2})[-/.](\d{1,2})[ T](\d{1,2}):(\d{2})(?::(\d{2})(?:\.(\d{1,9}))?)?(Z|[+-]\d{2}:?\d{2})?$/u;

export const ARTICLE_DATE_SOURCES = Object.freeze([
  "frontmatter",
  "export_metadata",
  "canonical_metadata",
  "filename_convention",
  "title_prefix",
  "unknown",
]);

export const ARTICLE_DATE_CONFIDENCES = Object.freeze([
  "high",
  "medium",
  "low",
  "unknown",
]);

function cleanScalar(value) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).replace(/\s+/gu, " ").trim();
  return normalized || undefined;
}

function validCalendarDate(year, month, day) {
  const candidate = new Date(Date.UTC(year, month - 1, day));
  return (
    candidate.getUTCFullYear() === year &&
    candidate.getUTCMonth() === month - 1 &&
    candidate.getUTCDate() === day
  );
}

function normalizedDate(yearText, monthText, dayText) {
  const year = Number(yearText);
  const month = Number(monthText);
  const day = Number(dayText);
  if (!validCalendarDate(year, month, day)) return undefined;
  return `${yearText}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

function normalizedDateTime(parts) {
  const [, yearText, monthText, dayText, hourText, minuteText, secondText, fraction, zone] = parts;
  const date = normalizedDate(yearText, monthText, dayText);
  if (!date) return undefined;
  const hour = Number(hourText);
  const minute = Number(minuteText);
  const second = secondText === undefined ? 0 : Number(secondText);
  if (hour > 23 || minute > 59 || second > 59) return undefined;
  const normalizedFraction = fraction ? `.${fraction}` : "";
  const normalizedZone = zone?.replace(/([+-]\d{2})(\d{2})$/u, "$1:$2") ?? "";
  return `${date}T${String(hour).padStart(2, "0")}:${minuteText}:${String(second).padStart(2, "0")}${normalizedFraction}${normalizedZone}`;
}

/**
 * Normalize a value only when it comes from a trusted publication-date field
 * or a separately identified export convention. This function never scans
 * arbitrary article prose for dates.
 */
export function normalizeTrustedDate(value) {
  const raw = cleanScalar(value);
  if (!raw) return undefined;

  const timeMatch = raw.match(DATE_TIME);
  if (timeMatch) return normalizedDateTime(timeMatch);

  const dateMatch = raw.match(DATE_PARTS);
  if (dateMatch) return normalizedDate(...dateMatch.slice(1));

  const compactMatch = raw.match(COMPACT_DATE);
  if (compactMatch) return normalizedDate(...compactMatch.slice(1));

  const chineseMatch = raw.match(CHINESE_DATE);
  if (chineseMatch) {
    const [, yearText, monthText, dayText, hourText, minuteText, secondText] = chineseMatch;
    if (hourText === undefined) return normalizedDate(yearText, monthText, dayText);
    return normalizedDateTime([
      raw,
      yearText,
      monthText,
      dayText,
      hourText,
      minuteText,
      secondText,
      undefined,
      undefined,
    ]);
  }

  return undefined;
}

export function dateOnly(value) {
  return normalizeTrustedDate(value)?.slice(0, 10);
}

export function isCanonicalTrustedDate(value) {
  const raw = cleanScalar(value);
  if (!raw || !normalizeTrustedDate(raw)) return false;
  return /^\d{4}-\d{2}-\d{2}(?:T\d{2}:\d{2}(?::\d{2}(?:\.\d{1,9})?)?(?:Z|[+-]\d{2}:?\d{2})?)?$/u.test(raw);
}

export function filenameDateCandidate(relativePath) {
  const basename = String(relativePath || "").split(/[\\/]/u).pop() || "";
  const match = basename.match(/^(20\d{6})(?:[_\-\s]|$)/u);
  return match ? dateOnly(match[1]) : undefined;
}

export function titlePrefixDateCandidate(title) {
  const match = String(title || "").match(/^(20\d{6})(?:\s|$)/u);
  return match ? dateOnly(match[1]) : undefined;
}

/**
 * The exporter historically wrote a compact source line near the top of the
 * Markdown body. We inspect only that structural line, and only when it
 * contains the known account or the generated blockquote marker.
 */
export function exportMetadataDateCandidate(body, account) {
  const accountText = String(account || "").trim();
  const lines = String(body || "").split(/\r?\n/u).slice(0, 60);
  for (const line of lines) {
    const hasDate = line.match(/(20\d{2})[-/.](\d{1,2})[-/.](\d{1,2})(?:[ T](\d{1,2}):(\d{2})(?::(\d{2}))?)?/u);
    if (!hasDate) continue;
    const structuralLine =
      line.trimStart().startsWith(">") ||
      line.trimStart().startsWith("原创") ||
      line.trimStart().startsWith("原創") ||
      (accountText && line.includes(accountText));
    if (!structuralLine) continue;
    const raw = hasDate[0];
    const normalized = normalizeTrustedDate(raw);
    if (normalized) return { raw, normalized, line: line.trim() };
  }
  return undefined;
}

export function publicationDateFields(metadata) {
  const fields = [
    ["date", metadata?.date],
    ["publishedAt", metadata?.publishedAt],
    ["published_at", metadata?.published_at],
    ["published_date", metadata?.published_date],
    ["publication_date", metadata?.publication_date],
    ["publish_date", metadata?.publish_date],
  ];
  return fields
    .filter(([, value]) => value !== undefined && value !== null && String(value).trim() !== "")
    .map(([field, value]) => ({
      field,
      raw: String(value),
      normalized: normalizeTrustedDate(value),
    }));
}

export function uniqueNormalizedDates(candidates) {
  return [...new Set(candidates.map((candidate) => candidate.normalized).filter(Boolean))];
}

export function titlePrefixFallbackIsAllowed(
  agreementWithFilename,
  agreementWithTrustedMetadata,
  threshold = 0.98,
) {
  return agreementWithFilename >= threshold && agreementWithTrustedMetadata >= threshold;
}
