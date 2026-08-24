import { NextResponse } from "next/server";

export const runtime = "nodejs";

function supabaseConfig() {
  const url = process.env.SUPABASE_URL?.replace(/\/$/, "") || "";
  const key = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY || "";
  const table = process.env.SUPABASE_FEEDBACK_TABLE?.trim() || "demo_research_feedback";
  return { url, key, table, configured: Boolean(url && key) };
}

function safePayload(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const json = JSON.stringify(value);
  if (json.length > 24_000) throw new Error("反馈内容过长，请精简后再提交。");
  return JSON.parse(json) as Record<string, unknown>;
}

async function supabaseFetch(path: string, init: RequestInit = {}) {
  const { url, key } = supabaseConfig();
  return fetch(`${url}/rest/v1/${path}`, {
    ...init,
    headers: {
      apikey: key,
      Authorization: `Bearer ${key}`,
      "Content-Type": "application/json",
      ...(init.headers || {}),
    },
    cache: "no-store",
  });
}

export async function GET() {
  const config = supabaseConfig();
  if (!config.configured) {
    return NextResponse.json({ configured: false, storage: "local", quickCount: 0, surveyCount: 0, averageOverall: null });
  }

  try {
    const response = await supabaseFetch(`${encodeURIComponent(config.table)}?select=kind,payload&limit=5000`);
    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json({ configured: true, storage: "supabase", error: detail || `Supabase HTTP ${response.status}` }, { status: 502 });
    }
    const rows = await response.json();
    const list = Array.isArray(rows) ? rows : [];
    const quick = list.filter((item) => item?.kind === "quick");
    const surveys = list.filter((item) => item?.kind === "survey");
    const overall = surveys
      .map((item) => Number(item?.payload?.ratings?.overall))
      .filter((value) => Number.isFinite(value) && value >= 1 && value <= 5);
    const averageOverall = overall.length ? Number((overall.reduce((a, b) => a + b, 0) / overall.length).toFixed(2)) : null;

    // Deliberately return aggregate metrics only. Raw/free-text participant
    // feedback remains server-side in Supabase and is never exposed by this public route.
    return NextResponse.json({
      configured: true,
      storage: "supabase",
      quickCount: quick.length,
      surveyCount: surveys.length,
      averageOverall,
    });
  } catch (error) {
    return NextResponse.json({ configured: true, storage: "supabase", error: error instanceof Error ? error.message : "无法读取反馈数据。" }, { status: 500 });
  }
}

export async function POST(request: Request) {
  const config = supabaseConfig();
  if (!config.configured) {
    return NextResponse.json({ configured: false, stored: false, storage: "local", message: "Supabase 尚未配置，客户端可继续使用本地保存。" });
  }

  try {
    const body = await request.json();
    const kind = body?.kind === "survey" ? "survey" : body?.kind === "quick" ? "quick" : "";
    if (!kind) return NextResponse.json({ error: "无效的反馈类型。" }, { status: 400 });
    const payload = safePayload(body?.payload);
    const response = await supabaseFetch(encodeURIComponent(config.table), {
      method: "POST",
      headers: { Prefer: "return=minimal" },
      body: JSON.stringify({ kind, payload, source: "xjtlu-demo", app_version: "surf-demo-v2.5.7" }),
    });
    if (!response.ok) {
      const detail = await response.text();
      return NextResponse.json({ error: detail || `Supabase HTTP ${response.status}` }, { status: 502 });
    }
    return NextResponse.json({ configured: true, stored: true, storage: "supabase" });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "反馈保存失败。" }, { status: 500 });
  }
}
