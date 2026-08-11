export type Citation = { title: string; text?: string; url?: string; source?: string; publishedDate?: string };

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

function validExternalUrl(value: unknown) {
  if (typeof value !== "string") return undefined;
  const match = value.match(/https?:\/\/[^\s<>"'`]+/i);
  if (!match) return undefined;
  const candidate = match[0].replace(/[)\]}>，。；;、]+$/u, "");
  try {
    const url = new URL(candidate);
    return url.protocol === "http:" || url.protocol === "https:" ? url.toString() : undefined;
  } catch {
    return undefined;
  }
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
    const url = validExternalUrl(candidate);
    if (url) return url;
  }

  const searchableText = [
    item.text,
    item.chunk,
    item.pageContent,
    metadata.text,
    metadata.description,
    JSON.stringify(metadata),
  ];
  for (const candidate of searchableText) {
    const url = validExternalUrl(candidate);
    if (url) return url;
  }
  return undefined;
}

export async function askAnythingLLM(workspace: string, message: string, mode = "query", sessionId?: string) {
  const base = process.env.ANYTHINGLLM_BASE_URL?.replace(/\/$/, "");
  const key = process.env.ANYTHINGLLM_API_KEY;
  if (!base || !key) throw new Error("AnythingLLM environment variables are not configured.");

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
    citations: (data.sources || data.citations || []).map((item: any) => {
      const metadata = item.metadata || {};
      return {
        title: item.title || metadata.title || item.source || item.document || "Knowledge-base source",
        text: item.text || item.chunk || item.pageContent,
        url: citationUrl(item, metadata),
        source: metadata.source_name || metadata.publisher || metadata.source,
        publishedDate: metadata.published_date || metadata.date,
      };
    }).filter((item: Citation, index: number, list: Citation[]) => index === list.findIndex(other => other.title === item.title && other.url === item.url)) as Citation[],
  };
}
