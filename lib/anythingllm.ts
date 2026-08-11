export type Citation = { title: string; text?: string; url?: string };

export function workspaceMap(): Record<string, string> {
  try {
    return JSON.parse(process.env.ANYTHINGLLM_WORKSPACES || "{}") as Record<string, string>;
  } catch {
    return {};
  }
}

export async function askAnythingLLM(workspace: string, message: string, mode = "query") {
  const base = process.env.ANYTHINGLLM_BASE_URL?.replace(/\/$/, "");
  const key = process.env.ANYTHINGLLM_API_KEY;
  if (!base || !key) throw new Error("AnythingLLM environment variables are not configured.");
  const response = await fetch(`${base}/api/v1/workspace/${encodeURIComponent(workspace)}/chat`, {
    method: "POST",
    headers: { Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
    body: JSON.stringify({ message, mode }),
    cache: "no-store",
  });
  if (!response.ok) throw new Error(`AnythingLLM request failed (${response.status}).`);
  const data = await response.json();
  return {
    text: data.textResponse || data.response || "",
    citations: (data.sources || data.citations || []).map((item: any) => ({
      title: item.title || item.source || item.document || "Knowledge-base source",
      text: item.text || item.chunk || item.pageContent,
      url: item.url || item.link,
    })) as Citation[],
  };
}
