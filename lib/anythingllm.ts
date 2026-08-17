import { articles } from "@/lib/articles";

export type Citation = { title: string; text?: string; url?: string; source?: string; publishedDate?: string; score?: number };

export class AnythingLLMError extends Error {
  constructor(message: string, public status: number) {
    super(message);
    this.name = "AnythingLLMError";
  }
}

export function workspaceMap(): Record<string, string> {
  try {
    return JSON.parse(process.env.ANYTHINGLLM_WORKSPACES || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

function anythingLLMConfig() {
  const base = process.env.ANYTHINGLLM_BASE_URL?.replace(/\/$/, "");
  const key = process.env.ANYTHINGLLM_API_KEY;
  if (!base || !key) throw new Error("AnythingLLM environment variables are not configured.");
  return { base, key };
}

function anythingLLMErrorMessage(status: number, raw: string) {
  let detail = raw.trim();
  try {
    const parsed = JSON.parse(raw);
    detail = parsed.error || parsed.message || parsed.errorMessage || "";
  } catch {
    // AnythingLLM can also return plain text.
  }

  if (status === 401 || status === 403) {
    return "AnythingLLM authentication failed. Check ANYTHINGLLM_API_KEY.";
  }
  if (status === 404) {
    return "AnythingLLM Workspace was not found. Check the Workspace slug in ANYTHINGLLM_WORKSPACES.";
  }
  if (status === 400) {
    return `AnythingLLM rejected the request (400)${detail ? `: ${detail}` : ". Check the Workspace slug and request format."}`;
  }
  return `AnythingLLM request failed (${status})${detail ? `: ${detail}` : "."}`;
}

const WEB_ASSET_HOSTS = new Set([
  "mmbiz.qpic.cn",
  "mmbiz.qlogo.cn",
  "wx.qlogo.cn",
  "thirdwx.qlogo.cn",
]);

function normalizeUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  const match = value
    .replace(/&amp;/gi, "&")
    .match(/https?:\/\/[^\s<>"'`]+/i);
  if (!match) return undefined;

  const candidate = match[0].replace(/[)\]}>，。；;、]+$/u, "");
  try {
    const url = new URL(candidate);
    if (url.protocol !== "http:" && url.protocol !== "https:") return undefined;
    url.hash = "";
    return url;
  } catch {
    return undefined;
  }
}

function isWebPage(url: URL) {
  if (WEB_ASSET_HOSTS.has(url.hostname.toLowerCase())) return false;
  return !/\.(?:avif|bmp|gif|ico|jpe?g|png|svg|webp|mp3|mp4|pdf)(?:$|[?#])/i.test(url.pathname);
}

function isWeChatArticle(url: URL) {
  if (url.hostname.toLowerCase() !== "mp.weixin.qq.com") return false;
  if (/^\/s\/[A-Za-z0-9_-]{10,}\/?$/.test(url.pathname)) return true;
  return url.pathname === "/s" && ["__biz", "mid", "idx", "sn"].every(key => url.searchParams.has(key));
}

function explicitPageUrl(value: unknown) {
  const url = normalizeUrl(value);
  return url && isWebPage(url) ? url.toString() : undefined;
}

function embeddedArticleUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  const candidates = value.replace(/&amp;/gi, "&").match(/https?:\/\/[^\s<>"'`]+/gi) || [];
  for (const candidate of candidates) {
    const url = normalizeUrl(candidate);
    if (url && isWeChatArticle(url)) return url.toString();
  }
  return undefined;
}

function citationUrl(item: any, metadata: Record<string, any>) {
  const explicitCandidates = [
    item.url,
    item.link,
    item.sourceUrl,
    item.source_url,
    item.originalUrl,
    item.original_url,
    metadata.source_url,
    metadata.sourceUrl,
    metadata.original_url,
    metadata.originalUrl,
    metadata.article_url,
    metadata.articleUrl,
    metadata.link,
    metadata.url,
  ];
  for (const candidate of explicitCandidates) {
    const url = explicitPageUrl(candidate);
    if (url) return url;
  }

  const searchableText = [item.text, item.chunk, item.pageContent, metadata.text, metadata.description, JSON.stringify(metadata)];
  for (const candidate of searchableText) {
    const url = embeddedArticleUrl(candidate);
    if (url) return url;
  }
  return undefined;
}

function normalizedTitle(value: unknown) {
  return String(value || "")
    .replace(/\.md$/i, "")
    .replace(/[|丨｜_—–\-\s【】\[\]@]+/g, "")
    .replace(/[^\p{L}\p{N}]/gu, "")
    .toLowerCase();
}

function indexedArticle(item: any, metadata: Record<string, any>) {
  const candidates = [
    item.title,
    item.source,
    item.document,
    item.chunkSource,
    metadata.title,
    metadata.sourceDocument,
    metadata.source_document,
    metadata.chunkSource,
    metadata.chunk_source,
  ]
    .map(normalizedTitle)
    .filter(value => value.length >= 8);
  return articles.find(article => {
    const title = normalizedTitle(article.title);
    return candidates.some(candidate => title.includes(candidate) || candidate.includes(title));
  });
}

function toCitation(item: any): Citation {
  const metadata = item?.metadata || {};
  const indexed = indexedArticle(item, metadata);
  const title = item?.title
    || metadata.title
    || item?.source
    || item?.document
    || item?.chunkSource
    || metadata.sourceDocument
    || metadata.source_document
    || metadata.chunkSource
    || metadata.chunk_source
    || "Knowledge-base source";
  const text = item?.text || item?.chunk || item?.pageContent || metadata.pageContent || metadata.text;
  const rawScore = Number(item?.score ?? metadata.score);
  return {
    title,
    text,
    url: indexed?.sourceUrl || citationUrl(item, metadata),
    source: indexed?.source || metadata.source_name || metadata.publisher || metadata.source || metadata.docAuthor,
    publishedDate: indexed?.publishedDate || metadata.published_date || metadata.published || metadata.date,
    score: Number.isFinite(rawScore) ? rawScore : undefined,
  };
}

function dedupeCitations(items: Citation[]) {
  return items.filter((item, index, list) => index === list.findIndex(other => {
    if (item.url && other.url) return item.url === other.url;
    return normalizedTitle(item.title) === normalizedTitle(other.title);
  }));
}

export async function askAnythingLLM(workspace: string, message: string, mode = "query", sessionId?: string) {
  const { base, key } = anythingLLMConfig();
  const response = await fetch(`${base}/api/v1/workspace/${encodeURIComponent(workspace)}/chat`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message, mode, ...(sessionId ? { sessionId } : {}) }),
    cache: "no-store",
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new AnythingLLMError(anythingLLMErrorMessage(response.status, raw), response.status);
  }

  const data = await response.json();
  return {
    text: data.textResponse || data.response || "",
    citations: dedupeCitations((data.sources || data.citations || []).map(toCitation)),
  };
}

export async function vectorSearchAnythingLLM(workspace: string, query: string, topN = 10, scoreThreshold = 0.2) {
  const { base, key } = anythingLLMConfig();
  const response = await fetch(`${base}/api/v1/workspace/${encodeURIComponent(workspace)}/vector-search`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ query, topN, scoreThreshold }),
    cache: "no-store",
  });

  if (!response.ok) {
    const raw = await response.text();
    throw new AnythingLLMError(anythingLLMErrorMessage(response.status, raw), response.status);
  }

  const data = await response.json();
  const candidates = Array.isArray(data)
    ? data
    : data.results || data.matches || data.chunks || data.sources || data.searchResults || data.embeddings || [];

  return dedupeCitations((Array.isArray(candidates) ? candidates : []).map(toCitation)).slice(0, topN);
}
