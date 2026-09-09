function cleanText(value) {
  if (typeof value !== "string" && typeof value !== "number") return undefined;
  const normalized = String(value).replace(/\s+/g, " ").trim();
  return normalized || undefined;
}

function normalizeOfficialUrl(value) {
  const raw = cleanText(value);
  if (!raw) return undefined;

  try {
    const parsed = new URL(raw);
    if (parsed.protocol !== "https:" && parsed.protocol !== "http:") {
      return undefined;
    }
    if (parsed.hostname.toLocaleLowerCase() !== "sdgs.un.org") {
      return undefined;
    }
    return parsed.href;
  } catch {
    return undefined;
  }
}

export function normalizeSdgTags(value) {
  if (!Array.isArray(value)) return undefined;

  const tags = [];
  const seen = new Set();
  for (const candidate of value) {
    if (candidate === null || typeof candidate !== "object" || Array.isArray(candidate)) {
      continue;
    }

    const code = cleanText(candidate.code);
    const tag = cleanText(candidate.tag);
    const url = normalizeOfficialUrl(candidate.url);
    if (!code || !tag || !url) continue;

    const level = cleanText(candidate.level);
    const reason = cleanText(candidate.reason);
    const identity = `${code}\u0000${tag}\u0000${url}`;
    if (seen.has(identity)) continue;
    seen.add(identity);
    tags.push({
      code,
      ...(level ? { level } : {}),
      tag,
      url,
      ...(reason ? { reason } : {}),
    });
  }

  return tags.length > 0 ? tags : undefined;
}

export function normalizeEnrichedSummary(value) {
  return cleanText(value);
}
