/**
 * Resolve an article's original source URL from trusted metadata or an
 * explicitly labelled source block in canonical Markdown.  Ordinary links,
 * image destinations and SDG reference links are deliberately ignored.
 */

export type SourceUrlResolution = {
  sourceUrl?: string;
  candidates: string[];
  conflict: boolean;
  structuredValid: boolean;
  invalidStructuredSourceUrl?: string;
};

const SOURCE_LABEL_PATTERN =
  /^(?:原文地址|原文链接|阅读原文|查看原文|微信原文|original\s+(?:article|link)(?:\s+url)?|original\s+article\s+url|read\s+original|view\s+original|source\s+link)$/iu;

function decodeBasicHtmlEntities(value: string) {
  return value
    .replace(/&amp;/giu, "&")
    .replace(/&quot;/giu, '"')
    .replace(/&#39;|&apos;/giu, "'")
    .replace(/&lt;/giu, "<")
    .replace(/&gt;/giu, ">");
}

/** Validate without rewriting the path or query string. */
export function normalizeSourceUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  const decoded = decodeBasicHtmlEntities(value.trim());
  if (!decoded) return undefined;
  try {
    const parsed = new URL(decoded);
    if ((parsed.protocol !== "http:" && parsed.protocol !== "https:") || !parsed.hostname) {
      return undefined;
    }
    return decoded;
  } catch {
    return undefined;
  }
}

function trimUrlPunctuation(value: string) {
  return value.replace(/[),.;:!?。，；：！？）】》]+$/u, "");
}

function destinationFromMarkdownLink(value: string) {
  // An image is never an original-source candidate, even when its line is
  // labelled as a source block.
  if (/!\[[^\]]*\]\s*\(/u.test(value)) return undefined;
  const match = value.match(
    /\]\(\s*(?:<([^>]+)>|([^\s)]+))/u,
  );
  return normalizeSourceUrl(trimUrlPunctuation(match?.[1] ?? match?.[2] ?? ""));
}

function sourceCandidatesFromPayload(payload: string) {
  const linked = destinationFromMarkdownLink(payload);
  if (linked) return [linked];
  if (/!\[[^\]]*\]\s*\(/u.test(payload)) return [];
  const matches = payload.match(/https?:\/\/[^\s<>"'`\])]+/giu) ?? [];
  return matches
    .map((value) => normalizeSourceUrl(trimUrlPunctuation(value)))
    .filter((value): value is string => value !== undefined);
}

function sourceLabelAndPayload(line: string) {
  const unquoted = line.replace(/^\s*(?:>\s*)+/u, "").trim();
  const directLink = unquoted.match(/^\[([^\]]+)\]\(/u);
  if (directLink && SOURCE_LABEL_PATTERN.test(directLink[1].trim())) {
    return { payload: unquoted };
  }
  const match = unquoted.match(
    /^(?:\[([^\]]+)\]|([^:：]+))\s*(?::|：)?\s*(.*)$/u,
  );
  if (!match) return undefined;
  const label = (match[1] ?? match[2] ?? "").trim();
  if (!SOURCE_LABEL_PATTERN.test(label)) return undefined;
  return { payload: match[3] ?? "" };
}

/** Extract only URLs attached to an explicit original-source label. */
export function extractExplicitSourceUrlCandidates(markdown: string) {
  const lines = markdown.split(/\r?\n/u);
  const candidates: string[] = [];
  for (let index = 0; index < lines.length; index += 1) {
    const labelled = sourceLabelAndPayload(lines[index]);
    if (!labelled) continue;
    let payload = labelled.payload;
    if (!payload.trim()) {
      // Support a compact two-line source block:
      //   原文地址
      //   https://...
      let next = index + 1;
      while (next < lines.length && !lines[next].trim()) next += 1;
      payload = lines[next] ?? "";
    }
    candidates.push(...sourceCandidatesFromPayload(payload));
  }
  return [...new Set(candidates)];
}

export function resolveArticleSourceUrl(input: {
  structuredSourceUrl?: unknown;
  markdown?: string;
}): SourceUrlResolution {
  const structured = normalizeSourceUrl(input.structuredSourceUrl);
  const invalidStructuredSourceUrl =
    input.structuredSourceUrl !== undefined && structured === undefined
      ? String(input.structuredSourceUrl)
      : undefined;
  const markdownCandidates = extractExplicitSourceUrlCandidates(input.markdown ?? "");
  const allCandidates = [...new Set([...(structured ? [structured] : []), ...markdownCandidates])];
  const conflict = allCandidates.length > 1;
  // A valid structured field is authoritative, but a conflict is surfaced to
  // diagnostics rather than silently treated as a clean match.
  const sourceUrl = structured ?? (!conflict ? markdownCandidates[0] : undefined);
  return {
    ...(sourceUrl ? { sourceUrl } : {}),
    candidates: allCandidates,
    conflict,
    structuredValid: structured !== undefined,
    ...(invalidStructuredSourceUrl ? { invalidStructuredSourceUrl } : {}),
  };
}
