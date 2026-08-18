import { NextResponse } from "next/server";
import pptxgen from "pptxgenjs";
import {
  askAnythingLLM,
  resolveWorkspaceSlug,
  vectorSearchAnythingLLM,
  type Citation,
} from "@/lib/anythingllm";

type SlidePlan = {
  title: string;
  subtitle?: string;
  layout?: "bullets" | "two-column" | "timeline" | "quote";
  bullets?: string[];
  leftTitle?: string;
  leftBullets?: string[];
  rightTitle?: string;
  rightBullets?: string[];
  timeline?: { label: string; detail: string }[];
  takeaway?: string;
  sourceIndices?: number[];
};

type DeckPlan = {
  title: string;
  subtitle?: string;
  audience?: string;
  slides: SlidePlan[];
};

const C = {
  ink: "182331",
  muted: "687684",
  purple: "5F63E8",
  purpleSoft: "EEEFFF",
  greenSoft: "EAF6F1",
  orangeSoft: "FFF3E8",
  line: "DCE2E9",
  bg: "F7F9FC",
  white: "FFFFFF",
};

function campusDate() {
  const parts = new Intl.DateTimeFormat("en-GB", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const get = (type: string) => parts.find((p) => p.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function isTimeSensitive(topic: string) {
  return /(近期|最近|现在|当前|可参加|还能参加|报名|截止|upcoming|recent|current|available|join|register|registration)/i.test(topic);
}

function compact(value: unknown, limit = 1000) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function dedupe(items: Citation[]) {
  const seen = new Set<string>();
  return items.filter((item) => {
    const key = (item.url || item.title || "").toLowerCase().replace(/\s+/g, "");
    if (!key || seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

async function retrieveEvidence(slug: string, topic: string, timeSensitive: boolean, currentDate: string) {
  const month = currentDate.slice(0, 7);
  const queries = [
    topic,
    `${topic} 活动日期 报名截止 地点 参与对象`,
    timeSensitive
      ? `校园活动 ${month} 之后 活动日期 报名 截止 参与`
      : `${topic} 部门 时间 地点 受众 关键事实`,
  ];
  const batches = await Promise.all(
    queries.map((q) => vectorSearchAnythingLLM(slug, q, 8, 0.15).catch(() => [] as Citation[])),
  );
  return dedupe(batches.flat()).slice(0, 12);
}

function evidenceBlock(citations: Citation[]) {
  return citations.map((item, index) => {
    const meta = [item.source, item.publishedDate].filter(Boolean).join(" · ");
    return `[S${index + 1}] ${compact(item.title, 180)}${meta ? `\n元数据：${meta}` : ""}${item.text ? `\n证据摘录：${compact(item.text, 1200)}` : ""}${item.url ? `\n原文：${item.url}` : ""}`;
  }).join("\n\n");
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error("模型没有返回可解析的 PPT 结构 JSON。");
  return JSON.parse(candidate);
}

function stringList(value: unknown, max = 5) {
  return (Array.isArray(value) ? value : [])
    .map((v) => String(v || "").trim())
    .filter(Boolean)
    .slice(0, max);
}

function normalizePlan(text: string, contentSlides: number, citations: Citation[], language: string): DeckPlan {
  const raw = extractJson(text);
  const slides: SlidePlan[] = (Array.isArray(raw?.slides) ? raw.slides : [])
    .map((s: any) => ({
      title: String(s?.title || "").trim().slice(0, 90),
      subtitle: typeof s?.subtitle === "string" ? s.subtitle.trim().slice(0, 150) : undefined,
      layout: ["bullets", "two-column", "timeline", "quote"].includes(s?.layout) ? s.layout : "bullets",
      bullets: stringList(s?.bullets),
      leftTitle: typeof s?.leftTitle === "string" ? s.leftTitle.trim().slice(0, 50) : undefined,
      leftBullets: stringList(s?.leftBullets),
      rightTitle: typeof s?.rightTitle === "string" ? s.rightTitle.trim().slice(0, 50) : undefined,
      rightBullets: stringList(s?.rightBullets),
      timeline: (Array.isArray(s?.timeline) ? s.timeline : []).slice(0, 5).map((x: any) => ({
        label: String(x?.label || "").trim().slice(0, 44),
        detail: String(x?.detail || "").trim().slice(0, 180),
      })),
      takeaway: typeof s?.takeaway === "string" ? s.takeaway.trim().slice(0, 220) : undefined,
      sourceIndices: (Array.isArray(s?.sourceIndices) ? s.sourceIndices : [])
        .map(Number)
        .filter((n: number) => Number.isInteger(n) && n > 0 && n <= citations.length)
        .slice(0, 5),
    }))
    .filter((s: SlidePlan) => s.title)
    .slice(0, contentSlides);

  while (slides.length < contentSlides) {
    const i = slides.length % Math.max(1, citations.length);
    const source = citations[i];
    slides.push({
      title: language === "en" ? "Additional verified evidence" : "补充可核查信息",
      layout: "bullets",
      bullets: source
        ? [`${source.title}${source.publishedDate ? ` · ${source.publishedDate}` : ""}`]
        : [language === "en" ? "No additional verified evidence was returned." : "没有更多可核查证据。"],
      sourceIndices: source ? [i + 1] : [],
    });
  }

  return {
    title: String(raw?.title || (language === "en" ? "XJTLU Campus Briefing" : "西浦校园信息简报")).trim().slice(0, 120),
    subtitle: typeof raw?.subtitle === "string" ? raw.subtitle.trim().slice(0, 180) : undefined,
    audience: typeof raw?.audience === "string" ? raw.audience.trim().slice(0, 120) : undefined,
    slides,
  };
}

function sourceLine(indices: number[] | undefined, citations: Citation[]) {
  return (indices || [])
    .map((index) => ({ index, citation: citations[index - 1] }))
    .filter((x) => x.citation)
    .map(({ index, citation }) => `S${index} ${citation.title}${citation.publishedDate ? ` · ${citation.publishedDate}` : ""}`)
    .join("  |  ");
}

function bullets(items: string[]) {
  return items.map((text) => ({ text, options: { bullet: { indent: 18 }, breakLine: true, paraSpaceAfterPt: 10 } }));
}

async function buildPptx(plan: DeckPlan, citations: Citation[], language: string, workspace: string, totalSlides: number) {
  const pptx = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "XJTLU Campus Knowledge Assistant";
  pptx.company = "Xi'an Jiaotong-Liverpool University";
  pptx.title = plan.title;
  const fontFace = language === "en" ? "Aptos" : "Microsoft YaHei";

  const cover = pptx.addSlide();
  cover.background = { color: C.bg };
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: C.purple }, line: { color: C.purple } });
  cover.addText("XJTLU CAMPUS KNOWLEDGE ASSISTANT", { x: 0.9, y: 0.72, w: 5.8, h: 0.3, fontFace: "Aptos", fontSize: 10, bold: true, color: C.purple, margin: 0 });
  cover.addText(plan.title, { x: 0.9, y: 1.7, w: 10.8, h: 1.5, fontFace, fontSize: 32, bold: true, color: C.ink, margin: 0, fit: "shrink" });
  if (plan.subtitle) cover.addText(plan.subtitle, { x: 0.92, y: 3.35, w: 10, h: 0.7, fontFace, fontSize: 15, color: C.muted, margin: 0, fit: "shrink" });
  cover.addText(`${workspace}${plan.audience ? ` · ${plan.audience}` : ""}`, { x: 0.94, y: 5.8, w: 8, h: 0.3, fontFace, fontSize: 10, color: C.muted, margin: 0 });

  plan.slides.forEach((item, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: C.bg };
    slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.08, fill: { color: C.purple }, line: { color: C.purple } });
    slide.addText(item.title, { x: 0.72, y: 0.48, w: 11.8, h: 0.55, fontFace, fontSize: 25, bold: true, color: C.ink, margin: 0, fit: "shrink" });
    if (item.subtitle) slide.addText(item.subtitle, { x: 0.74, y: 1.05, w: 11.2, h: 0.34, fontFace, fontSize: 10.5, color: C.muted, margin: 0, fit: "shrink" });

    if (item.layout === "two-column") {
      const cols = [
        { x: 0.76, title: item.leftTitle || (language === "en" ? "Key point A" : "要点 A"), list: item.leftBullets || [], fill: C.greenSoft },
        { x: 6.75, title: item.rightTitle || (language === "en" ? "Key point B" : "要点 B"), list: item.rightBullets || [], fill: C.orangeSoft },
      ];
      cols.forEach((col) => {
        slide.addShape(pptx.ShapeType.roundRect, { x: col.x, y: 1.62, w: 5.72, h: 4.86, fill: { color: C.white }, line: { color: C.line } });
        slide.addShape(pptx.ShapeType.roundRect, { x: col.x + 0.18, y: 1.84, w: 2.2, h: 0.48, fill: { color: col.fill }, line: { color: col.fill } });
        slide.addText(col.title, { x: col.x + 0.32, y: 1.95, w: 1.9, h: 0.22, fontFace, fontSize: 10.5, bold: true, color: C.ink, margin: 0, fit: "shrink" });
        slide.addText(bullets(col.list), { x: col.x + 0.36, y: 2.55, w: 4.9, h: 3.35, fontFace, fontSize: 16.5, color: C.ink, margin: 0.05, fit: "shrink" });
      });
    } else if (item.layout === "timeline" && item.timeline?.length) {
      item.timeline.slice(0, 5).forEach((x, i) => {
        const y = 1.65 + i * 0.96;
        slide.addShape(pptx.ShapeType.ellipse, { x: 1.02, y, w: 0.48, h: 0.48, fill: { color: C.purple }, line: { color: C.purple } });
        slide.addText(x.label, { x: 1.65, y, w: 2.1, h: 0.3, fontFace, fontSize: 12, bold: true, color: C.purple, margin: 0, fit: "shrink" });
        slide.addText(x.detail, { x: 3.7, y, w: 8, h: 0.55, fontFace, fontSize: 13.5, color: C.ink, margin: 0, fit: "shrink" });
      });
    } else if (item.layout === "quote") {
      slide.addText(item.takeaway || item.bullets?.[0] || "", { x: 1.25, y: 2.0, w: 10.8, h: 2.8, fontFace, fontSize: 27, bold: true, color: C.ink, align: "center", valign: "mid", margin: 0, fit: "shrink" });
    } else {
      const list = item.bullets?.length ? item.bullets : [item.takeaway || (language === "en" ? "Insufficient verified evidence." : "当前检索证据不足。")];
      slide.addShape(pptx.ShapeType.roundRect, { x: 0.76, y: 1.62, w: 11.8, h: 4.9, fill: { color: C.white }, line: { color: C.line } });
      slide.addText(bullets(list), { x: 1.05, y: 1.95, w: 10.9, h: 3.8, fontFace, fontSize: 19, color: C.ink, margin: 0.06, fit: "shrink" });
    }

    const source = sourceLine(item.sourceIndices, citations);
    if (source) slide.addText(source, { x: 0.75, y: 7.12, w: 10.7, h: 0.22, fontFace, fontSize: 7.5, italic: true, color: "7D8792", margin: 0, fit: "shrink" });
    slide.addText(String(index + 2), { x: 11.95, y: 7.1, w: 0.62, h: 0.24, fontFace, fontSize: 8, color: C.muted, align: "right", margin: 0 });
  });

  const sources = pptx.addSlide();
  sources.background = { color: C.bg };
  sources.addText(language === "en" ? "Sources" : "参考来源", { x: 0.72, y: 0.5, w: 11.5, h: 0.6, fontFace, fontSize: 25, bold: true, color: C.ink, margin: 0 });
  const sourceRows = citations.slice(0, 9).map((item, index) => `S${index + 1} ${item.title}${item.publishedDate ? ` · ${item.publishedDate}` : ""}${item.source ? ` · ${item.source}` : ""}`);
  sources.addText(bullets(sourceRows.length ? sourceRows : [language === "en" ? "No displayable source metadata returned." : "未返回可展示的来源元数据。"]), { x: 0.95, y: 1.55, w: 11.1, h: 5.3, fontFace, fontSize: 12.5, color: C.ink, margin: 0, fit: "shrink" });
  sources.addText(String(totalSlides), { x: 11.95, y: 7.1, w: 0.62, h: 0.24, fontFace, fontSize: 8, color: C.muted, align: "right", margin: 0 });

  return pptx.write({ outputType: "nodebuffer", compression: true });
}

export async function POST(request: Request) {
  try {
    const { message, account, workspaceSlug, sessionId, slideCount, language } = await request.json();
    const topic = typeof message === "string" ? message.trim() : "";
    const slug = resolveWorkspaceSlug(account, workspaceSlug);
    const totalSlides = Math.max(4, Math.min(12, Number(slideCount) || 7));
    const contentSlides = Math.max(2, totalSlides - 2);
    const lang = ["zh", "en", "bilingual"].includes(language) ? language : "zh";

    if (!topic) return NextResponse.json({ error: "请输入 PPT 主题。" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "当前知识库没有可用的 AnythingLLM Workspace。" }, { status: 400 });

    const today = campusDate();
    const timeSensitive = isTimeSensitive(topic);
    let citations = await retrieveEvidence(slug, topic, timeSensitive, today);
    if (!citations.length) {
      const fallback = await askAnythingLLM(slug, topic, "query", sessionId);
      citations = fallback.citations.slice(0, 10);
    }

    const languageRule = lang === "en"
      ? "Use concise English slide text."
      : lang === "bilingual"
        ? "Use concise bilingual Chinese + English slide text; preserve factual strings exactly."
        : "使用简洁中文生成幻灯片内容。";

    const prompt = `[PPT主题]\n${topic}\n\n[当前日期]\n${today}\n\n[证据]\n${evidenceBlock(citations) || "无可展示来源元数据；仍只能依据当前 Workspace。"}\n\n请根据以上真实证据生成正式汇报 PPT 的内容结构。${languageRule}\n\n必须遵守：\n1. 只返回合法 JSON，不要 Markdown。\n2. 只生成 ${contentSlides} 个内容页；系统另加 1 页封面和 1 页来源，因此最终总页数严格等于 ${totalSlides}。\n3. 如果用户问的是“近期校园活动”等广义主题，且证据支持多个活动，应覆盖多个活动，不要把整份 PPT 变成单个旧活动。\n4. 若主题涉及近期/当前/可参加：活动日期或报名截止早于 ${today} 的内容不得包装成当前机会；只有发布日期不能证明活动仍有效；年份不清楚时必须标注无法确认。\n5. 若没有可明确确认仍有效的活动，要在页面中明确说明，不要用过期活动填满 PPT。\n6. 页面布局可用 bullets、two-column、timeline、quote；避免所有页面同一种版式。\n7. 日期、数字、姓名、地点、部门、URL 必须按证据保留，缺失信息不要补写。\n8. sourceIndices 必须引用证据的 S 序号。\n\nJSON schema:\n{\"title\":\"演示标题\",\"subtitle\":\"副标题\",\"audience\":\"受众\",\"slides\":[{\"title\":\"页面标题\",\"subtitle\":\"可选\",\"layout\":\"bullets|two-column|timeline|quote\",\"bullets\":[\"要点\"],\"leftTitle\":\"左栏\",\"leftBullets\":[\"...\"],\"rightTitle\":\"右栏\",\"rightBullets\":[\"...\"],\"timeline\":[{\"label\":\"日期/阶段\",\"detail\":\"说明\"}],\"takeaway\":\"核心结论\",\"sourceIndices\":[1,2]}]}`;

    const result = await askAnythingLLM(slug, prompt, "query", sessionId);
    const plan = normalizePlan(result.text, contentSlides, citations, lang);
    const output = await buildPptx(plan, citations, lang, String(account || slug), totalSlides);
    const view = output instanceof Uint8Array ? output : new Uint8Array(output as ArrayBuffer);

    // Next.js 15 / TS 5.7 may reject Uint8Array<ArrayBufferLike> as BodyInit.
    // Copy into a plain ArrayBuffer so the response body has an unambiguous web type.
    const body = new ArrayBuffer(view.byteLength);
    new Uint8Array(body).set(view);

    const safeName = plan.title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "xjtlu-briefing";
    return new NextResponse(body, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`${safeName}.pptx`)}`,
        "X-Generated-Slides": String(totalSlides),
        "X-Requested-Slides": String(totalSlides),
        "X-Source-Count": String(citations.length),
        "X-Time-Sensitive": timeSensitive ? "1" : "0",
        "Cache-Control": "no-store",
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PPT 生成失败。" }, { status: 500 });
  }
}
