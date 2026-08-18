import { NextResponse } from "next/server";
import pptxgen from "pptxgenjs";
import { askAnythingLLM, resolveWorkspaceSlug, vectorSearchAnythingLLM, type Citation } from "@/lib/anythingllm";

type SlideLayout = "bullets" | "two-column" | "timeline" | "quote";
type TimelineItem = { label: string; detail: string };
type SlidePlan = {
  title: string;
  subtitle?: string;
  layout: SlideLayout;
  bullets?: string[];
  leftTitle?: string;
  leftBullets?: string[];
  rightTitle?: string;
  rightBullets?: string[];
  timeline?: TimelineItem[];
  takeaway?: string;
  sourceIndices?: number[];
};
type DeckPlan = { title: string; subtitle?: string; audience?: string; goal?: string; slides: SlidePlan[] };

const COLORS = {
  ink: "182331",
  muted: "687684",
  purple: "5F63E8",
  purpleSoft: "EEEFFF",
  green: "2E8B70",
  greenSoft: "EAF6F1",
  orange: "D9813B",
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
  const get = (type: string) => parts.find((part) => part.type === type)?.value || "";
  return `${get("year")}-${get("month")}-${get("day")}`;
}

function isTimeSensitive(topic: string) {
  return /(近期|最近|现在|当前|可参加|还能参加|报名|截止|upcoming|recent|current|available|join|register|registration)/i.test(topic);
}

function compact(value: unknown, limit = 800) {
  return String(value || "").replace(/\s+/g, " ").trim().slice(0, limit);
}

function dedupeCitations(items: Citation[]) {
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
    queries.map((query) => vectorSearchAnythingLLM(slug, query, 8, 0.15).catch(() => [] as Citation[])),
  );
  return dedupeCitations(batches.flat()).slice(0, 12);
}

function evidenceContext(citations: Citation[]) {
  return citations.map((item, index) => {
    const meta = [item.source, item.publishedDate].filter(Boolean).join(" · ");
    return `[S${index + 1}] ${compact(item.title, 180)}${meta ? `\n元数据：${meta}` : ""}${item.text ? `\n证据摘录：${compact(item.text, 1400)}` : ""}${item.url ? `\n原文：${item.url}` : ""}`;
  }).join("\n\n");
}

function extractJson(text: string) {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error("模型没有返回可解析的 PPT 结构 JSON。");
  return JSON.parse(candidate);
}

function cleanList(value: unknown, limit = 6) {
  return (Array.isArray(value) ? value : [])
    .map((item) => String(item || "").replace(/\s+/g, " ").trim())
    .filter(Boolean)
    .slice(0, limit);
}

function parsePlan(text: string, contentSlides: number): DeckPlan {
  const raw = extractJson(text);
  const allowed = new Set<SlideLayout>(["bullets", "two-column", "timeline", "quote"]);
  const slides = (Array.isArray(raw?.slides) ? raw.slides : []).map((slide: any): SlidePlan | null => {
    const title = String(slide?.title || "").trim().slice(0, 90);
    if (!title) return null;
    const layout = allowed.has(slide?.layout) ? slide.layout as SlideLayout : "bullets";
    const timeline = (Array.isArray(slide?.timeline) ? slide.timeline : [])
      .map((item: any) => ({
        label: String(item?.label || "").trim().slice(0, 44),
        detail: String(item?.detail || "").trim().slice(0, 180),
      }))
      .filter((item: TimelineItem) => item.label || item.detail)
      .slice(0, 6);
    const sourceIndices = (Array.isArray(slide?.sourceIndices) ? slide.sourceIndices : [])
      .map((item: unknown) => Number(item))
      .filter((item: number) => Number.isInteger(item) && item > 0)
      .slice(0, 6);
    return {
      title,
      subtitle: typeof slide?.subtitle === "string" ? slide.subtitle.trim().slice(0, 150) : undefined,
      layout,
      bullets: cleanList(slide?.bullets),
      leftTitle: typeof slide?.leftTitle === "string" ? slide.leftTitle.trim().slice(0, 50) : undefined,
      leftBullets: cleanList(slide?.leftBullets, 5),
      rightTitle: typeof slide?.rightTitle === "string" ? slide.rightTitle.trim().slice(0, 50) : undefined,
      rightBullets: cleanList(slide?.rightBullets, 5),
      timeline,
      takeaway: typeof slide?.takeaway === "string" ? slide.takeaway.trim().slice(0, 220) : undefined,
      sourceIndices,
    };
  }).filter((item: SlidePlan | null): item is SlidePlan => Boolean(item)).slice(0, contentSlides);

  if (!slides.length) throw new Error("没有生成有效的 PPT 页面内容。");
  return {
    title: String(raw?.title || slides[0].title || "XJTLU Campus Briefing").trim().slice(0, 120),
    subtitle: typeof raw?.subtitle === "string" ? raw.subtitle.trim().slice(0, 180) : undefined,
    audience: typeof raw?.audience === "string" ? raw.audience.trim().slice(0, 120) : undefined,
    goal: typeof raw?.goal === "string" ? raw.goal.trim().slice(0, 180) : undefined,
    slides,
  };
}

function ensureExactContentSlides(plan: DeckPlan, contentSlides: number, citations: Citation[], language: string) {
  const slides = [...plan.slides].slice(0, contentSlides);
  while (slides.length < contentSlides) {
    const start = (slides.length * 3) % Math.max(1, citations.length);
    const picks = citations.slice(start, start + 3);
    slides.push({
      title: language === "en" ? "Additional evidence" : "补充证据",
      layout: "bullets",
      bullets: picks.length
        ? picks.map((item) => `${item.title}${item.publishedDate ? ` · ${item.publishedDate}` : ""}`)
        : [language === "en" ? "No additional verified evidence was returned." : "没有更多可核查证据。"],
      sourceIndices: picks.map((item) => citations.indexOf(item) + 1).filter((index) => index > 0),
    });
  }
  return { ...plan, slides };
}

function sourceLine(indices: number[] | undefined, citations: Citation[]) {
  return (indices || [])
    .map((index) => ({ index, citation: citations[index - 1] }))
    .filter((item) => item.citation)
    .map(({ index, citation }) => `S${index} ${citation.title}${citation.publishedDate ? ` · ${citation.publishedDate}` : ""}`)
    .join("  |  ");
}

function bulletRuns(items: string[]) {
  return items.map((text) => ({ text, options: { bullet: { indent: 18 }, breakLine: true, paraSpaceAfterPt: 10 } }));
}

function addTopRule(pptx: any, slide: any) {
  slide.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 13.333, h: 0.08, fill: { color: COLORS.purple }, line: { color: COLORS.purple } });
}

function addPageTitle(pptx: any, slide: any, title: string, subtitle: string | undefined, fontFace: string) {
  addTopRule(pptx, slide);
  slide.addText(title, { x: 0.72, y: 0.48, w: 11.8, h: 0.55, fontFace, fontSize: 25, bold: true, color: COLORS.ink, margin: 0, fit: "shrink" });
  if (subtitle) slide.addText(subtitle, { x: 0.74, y: 1.05, w: 11.2, h: 0.34, fontFace, fontSize: 10.5, color: COLORS.muted, margin: 0, fit: "shrink" });
}

function addFooter(pptx: any, slide: any, page: number, source: string, fontFace: string) {
  slide.addShape(pptx.ShapeType.line, { x: 0.72, y: 7.08, w: 11.9, h: 0, line: { color: COLORS.line, width: 1 } });
  if (source) slide.addText(source, { x: 0.74, y: 7.13, w: 10.7, h: 0.22, fontFace, fontSize: 7.5, italic: true, color: "7D8792", margin: 0, fit: "shrink" });
  slide.addText(String(page), { x: 11.95, y: 7.1, w: 0.62, h: 0.24, fontFace, fontSize: 8, color: COLORS.muted, align: "right", margin: 0 });
}

function addBullets(pptx: any, slide: any, plan: SlidePlan, fontFace: string) {
  const items = plan.bullets?.length ? plan.bullets : [plan.takeaway || "当前检索证据不足。"];
  slide.addShape(pptx.ShapeType.roundRect, { x: 0.74, y: 1.6, w: 11.85, h: 4.95, fill: { color: COLORS.white }, line: { color: "E4E8EE", width: 1 } });
  slide.addText(bulletRuns(items), { x: 1.05, y: 1.95, w: 10.95, h: 3.75, fontFace, fontSize: 19, color: COLORS.ink, margin: 0.06, valign: "top", fit: "shrink" });
  if (plan.takeaway) {
    slide.addShape(pptx.ShapeType.roundRect, { x: 1.02, y: 5.72, w: 10.7, h: 0.62, fill: { color: COLORS.purpleSoft }, line: { color: COLORS.purpleSoft } });
    slide.addText(plan.takeaway, { x: 1.2, y: 5.86, w: 10.35, h: 0.28, fontFace, fontSize: 10.5, bold: true, color: "4B52BF", margin: 0, fit: "shrink" });
  }
}

function addTwoColumn(pptx: any, slide: any, plan: SlidePlan, fontFace: string) {
  const columns = [
    { x: 0.76, color: COLORS.green, soft: COLORS.greenSoft, title: plan.leftTitle || "要点 A", bullets: plan.leftBullets || [] },
    { x: 6.75, color: COLORS.orange, soft: COLORS.orangeSoft, title: plan.rightTitle || "要点 B", bullets: plan.rightBullets || [] },
  ];
  columns.forEach((column) => {
    slide.addShape(pptx.ShapeType.roundRect, { x: column.x, y: 1.62, w: 5.72, h: 4.86, fill: { color: COLORS.white }, line: { color: "E2E7ED" } });
    slide.addShape(pptx.ShapeType.roundRect, { x: column.x + 0.18, y: 1.84, w: 2.08, h: 0.48, fill: { color: column.soft }, line: { color: column.soft } });
    slide.addText(column.title, { x: column.x + 0.34, y: 1.94, w: 1.75, h: 0.22, fontFace, fontSize: 10.5, bold: true, color: column.color, margin: 0, fit: "shrink" });
    slide.addText(bulletRuns(column.bullets), { x: column.x + 0.36, y: 2.55, w: 4.92, h: 3.25, fontFace, fontSize: 16.5, color: COLORS.ink, margin: 0.05, fit: "shrink" });
  });
}

function addTimeline(pptx: any, slide: any, plan: SlidePlan, fontFace: string) {
  const items = plan.timeline?.length ? plan.timeline : (plan.bullets || []).slice(0, 5).map((item, index) => ({ label: `0${index + 1}`, detail: item }));
  const startY = 1.65;
  items.slice(0, 5).forEach((item, index) => {
    const y = startY + index * 0.96;
    slide.addShape(pptx.ShapeType.ellipse, { x: 1.02, y, w: 0.48, h: 0.48, fill: { color: COLORS.purple }, line: { color: COLORS.purple } });
    slide.addText(item.label, { x: 1.64, y: y - 0.02, w: 2.35, h: 0.28, fontFace, fontSize: 12, bold: true, color: COLORS.purple, margin: 0, fit: "shrink" });
    slide.addText(item.detail, { x: 3.82, y: y - 0.02, w: 7.95, h: 0.54, fontFace, fontSize: 13.5, color: COLORS.ink, margin: 0, fit: "shrink" });
    if (index < Math.min(items.length, 5) - 1) slide.addShape(pptx.ShapeType.line, { x: 1.25, y: y + 0.48, w: 0, h: 0.48, line: { color: "C7CCE8", width: 2 } });
  });
}

function addQuote(pptx: any, slide: any, plan: SlidePlan, fontFace: string) {
  const quote = plan.takeaway || plan.bullets?.[0] || plan.subtitle || "";
  slide.addText("“", { x: 0.92, y: 1.55, w: 0.7, h: 0.7, fontFace, fontSize: 42, bold: true, color: COLORS.purple, margin: 0 });
  slide.addText(quote, { x: 1.62, y: 1.85, w: 10.45, h: 2.35, fontFace, fontSize: 25, bold: true, color: COLORS.ink, margin: 0, valign: "mid", fit: "shrink" });
  if (plan.bullets && plan.bullets.length > 1) slide.addText(bulletRuns(plan.bullets.slice(1)), { x: 1.65, y: 4.45, w: 9.9, h: 1.5, fontFace, fontSize: 13, color: COLORS.muted, margin: 0, fit: "shrink" });
}

async function buildPptx(plan: DeckPlan, citations: Citation[], language: string, workspaceLabel: string, totalSlides: number) {
  const pptx: any = new pptxgen();
  pptx.layout = "LAYOUT_WIDE";
  pptx.author = "XJTLU Campus Information Assistant";
  pptx.company = "Xi'an Jiaotong-Liverpool University";
  pptx.subject = plan.goal || "Knowledge-base briefing";
  pptx.title = plan.title;
  const fontFace = language === "en" ? "Aptos" : "Microsoft YaHei";

  const cover = pptx.addSlide();
  cover.background = { color: COLORS.bg };
  cover.addShape(pptx.ShapeType.rect, { x: 0, y: 0, w: 0.18, h: 7.5, fill: { color: COLORS.purple }, line: { color: COLORS.purple } });
  cover.addText("XJTLU CAMPUS KNOWLEDGE ASSISTANT", { x: 0.9, y: 0.72, w: 5.8, h: 0.3, fontFace: "Aptos", fontSize: 10, bold: true, color: COLORS.purple, charSpacing: 1.5, margin: 0 });
  cover.addText(plan.title, { x: 0.9, y: 1.7, w: 10.8, h: 1.55, fontFace, fontSize: 32, bold: true, color: COLORS.ink, margin: 0, fit: "shrink" });
  if (plan.subtitle) cover.addText(plan.subtitle, { x: 0.94, y: 3.45, w: 9.8, h: 0.68, fontFace, fontSize: 15, color: COLORS.muted, margin: 0, fit: "shrink" });
  cover.addShape(pptx.ShapeType.roundRect, { x: 0.92, y: 5.45, w: 5.8, h: 0.8, fill: { color: COLORS.white }, line: { color: "E1E6EC" } });
  cover.addText(`${workspaceLabel}${plan.audience ? `  ·  ${plan.audience}` : ""}`, { x: 1.18, y: 5.72, w: 5.3, h: 0.22, fontFace, fontSize: 10, color: COLORS.muted, margin: 0, fit: "shrink" });
  cover.addText(new Intl.DateTimeFormat(language === "en" ? "en-GB" : "zh-CN", { timeZone: "Asia/Shanghai", year: "numeric", month: "long", day: "numeric" }).format(new Date()), { x: 9.2, y: 6.72, w: 3.1, h: 0.28, fontFace, fontSize: 9, color: COLORS.muted, margin: 0, align: "right" });

  plan.slides.forEach((planSlide, index) => {
    const slide = pptx.addSlide();
    slide.background = { color: COLORS.bg };
    addPageTitle(pptx, slide, planSlide.title, planSlide.subtitle, fontFace);
    if (planSlide.layout === "two-column") addTwoColumn(pptx, slide, planSlide, fontFace);
    else if (planSlide.layout === "timeline") addTimeline(pptx, slide, planSlide, fontFace);
    else if (planSlide.layout === "quote") addQuote(pptx, slide, planSlide, fontFace);
    else addBullets(pptx, slide, planSlide, fontFace);
    addFooter(pptx, slide, index + 2, sourceLine(planSlide.sourceIndices, citations), fontFace);
  });

  const sources = pptx.addSlide();
  sources.background = { color: COLORS.bg };
  addPageTitle(
    pptx,
    sources,
    language === "en" ? "Sources" : "参考来源",
    language === "en" ? "Evidence used in this presentation" : "本演示文稿使用的知识库证据",
    fontFace,
  );
  const entries = citations.slice(0, 9).map((item, index) => `S${index + 1}  ${item.title}${item.publishedDate ? ` · ${item.publishedDate}` : ""}${item.source ? ` · ${item.source}` : ""}`);
  sources.addText(entries.map((text) => ({ text, options: { bullet: { indent: 14 }, breakLine: true, paraSpaceAfterPt: 7 } })), { x: 0.95, y: 1.58, w: 11.1, h: 5.2, fontFace, fontSize: 11.5, color: COLORS.ink, margin: 0, fit: "shrink" });
  addFooter(pptx, sources, totalSlides, "XJTLU Campus Knowledge Assistant", fontFace);

  return await pptx.write({ outputType: "nodebuffer", compression: true });
}

export async function POST(request: Request) {
  try {
    const { message, account, workspaceSlug, sessionId, slideCount, language } = await request.json();
    const topic = typeof message === "string" ? message.trim() : "";
    const slug = resolveWorkspaceSlug(account, workspaceSlug);
    const totalSlides = Math.max(4, Math.min(12, Number(slideCount) || 7));
    const contentSlides = totalSlides - 2;
    const lang = ["zh", "en", "bilingual"].includes(language) ? language : "zh";
    if (!topic) return NextResponse.json({ error: "请输入 PPT 主题。" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "当前知识库没有可用的 AnythingLLM Workspace。" }, { status: 400 });

    const currentDate = campusDate();
    const timeSensitive = isTimeSensitive(topic);
    const citations = await retrieveEvidence(slug, topic, timeSensitive, currentDate);
    if (!citations.length) {
      return NextResponse.json({ error: "当前 Workspace 没有返回可用于生成 PPT 的检索证据。请换一个主题或检查知识库。" }, { status: 422 });
    }

    const languageRule = lang === "en"
      ? "Use English for all slide text."
      : lang === "bilingual"
        ? "Use concise bilingual Chinese + English slide text. Keep proper nouns, dates, numbers and URLs unchanged."
        : "使用简洁中文生成幻灯片内容。";

    const temporalRule = timeSensitive
      ? `这是时效性主题。当前校园日期为 ${currentDate}。只有当证据明确给出活动日期或报名截止日期，且该日期不早于 ${currentDate} 时，才能把活动描述为“当前可参加 / upcoming”。已结束、已截止或年份不明确的活动不能作为当前推荐。如果没有可明确确认仍有效的活动，PPT 必须明确写“当前检索证据中没有可确认仍可参加的活动”，可以把旧活动放在“近期发布但已过期 / 历史参考”中，但不得包装成当前机会。`
      : "如果涉及日期，请区分文章发布日期、活动日期和报名截止日期。";

    const broadActivity = /(校园活动|campus activities|events)/i.test(topic) && !/(某个|这场|该活动|conference|lecture|workshop|讲座|大赛|年会)/i.test(topic);
    const diversityRule = broadActivity
      ? "这是一个广义活动主题。若证据中存在多个仍有效活动，应优先覆盖多个不同活动，而不是把整份 PPT 深挖成单一活动。除非只有一个活动能通过时效性校验，否则同一活动最多占 1 个内容页。"
      : "围绕用户指定主题组织内容，不要无关扩展。";

    const prompt = `
[PPT主题]
${topic}

[当前日期]
${currentDate}

[可引用证据]
${evidenceContext(citations)}

请严格只使用上面的 [S1]...[S${citations.length}] 证据，为正式汇报生成 PPT 结构。${languageRule}

必须遵守：
1. 只返回一个合法 JSON 对象，不要 Markdown 或解释。
2. 必须恰好生成 ${contentSlides} 个内容页；系统会另外生成 1 个封面页和 1 个参考来源页，所以最终总页数恰好为 ${totalSlides} 页。
3. ${temporalRule}
4. ${diversityRule}
5. 不要把文章发布日期当作活动日期；不要根据“发布时间较新”推断活动仍可参加。
6. 页面布局可选 bullets、two-column、timeline、quote。不要所有页面都用相同布局。
7. bullets 使用 3-5 条精炼要点；two-column 分别填写 leftTitle/leftBullets 与 rightTitle/rightBullets；timeline 每项包含 label/detail；quote 用 takeaway 表示最重要结论。
8. 每页都要有清晰的信息目的，不要机械把文章逐篇拆页。
9. 日期、数字、姓名、地点、部门、URL 必须按证据保留。没有证据的内容不要补写。
10. sourceIndices 必须引用上面证据的 S 序号，例如 [1,3]。不能可靠对应时不要乱标。
11. 标题必须与用户主题一致。若用户问“近期校园活动”，不要把标题改成某一场旧活动，除非证据只支持该活动且明确说明它已过期或无法确认有效性。

JSON schema:
{"title":"演示标题","subtitle":"副标题","audience":"受众","goal":"汇报目标","slides":[{"title":"页面标题","subtitle":"可选","layout":"bullets|two-column|timeline|quote","bullets":["要点"],"leftTitle":"左栏","leftBullets":["..."],"rightTitle":"右栏","rightBullets":["..."],"timeline":[{"label":"阶段/日期","detail":"说明"}],"takeaway":"核心结论","sourceIndices":[1,2]}]}
`;

    const result = await askAnythingLLM(slug, prompt, "query", sessionId);
    const parsed = parsePlan(result.text, contentSlides);
    const plan = ensureExactContentSlides(parsed, contentSlides, citations, lang);
    const output = await buildPptx(plan, citations, lang, String(account || slug), totalSlides);
    const bytes = output instanceof Uint8Array ? output : new Uint8Array(output as ArrayBuffer);
    const safeName = plan.title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "xjtlu-briefing";

    return new NextResponse(bytes, {
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
