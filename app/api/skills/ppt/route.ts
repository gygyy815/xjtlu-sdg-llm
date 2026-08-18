import { NextResponse } from "next/server";
import JSZip from "jszip";
import { askAnythingLLM, resolveWorkspaceSlug } from "@/lib/anythingllm";

type SlidePlan = { title: string; bullets: string[]; source?: string };
type DeckPlan = { title: string; subtitle?: string; slides: SlidePlan[] };

function xml(value: unknown) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&apos;" }[char] || char));
}

function parsePlan(text: string, maxSlides: number): DeckPlan {
  const fenced = text.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced || text.match(/\{[\s\S]*\}/)?.[0];
  if (!candidate) throw new Error("模型没有返回可解析的 PPT JSON。");
  const raw = JSON.parse(candidate);
  const slides = (Array.isArray(raw?.slides) ? raw.slides : [])
    .map((slide: any) => ({
      title: String(slide?.title || "").trim().slice(0, 100),
      bullets: (Array.isArray(slide?.bullets) ? slide.bullets : []).map((item: unknown) => String(item).trim()).filter(Boolean).slice(0, 6),
      source: typeof slide?.source === "string" ? slide.source.trim().slice(0, 180) : undefined,
    }))
    .filter((slide: SlidePlan) => slide.title)
    .slice(0, maxSlides);
  if (!slides.length) throw new Error("没有生成有效的 PPT 页面内容。");
  return { title: String(raw?.title || slides[0].title || "XJTLU Campus Briefing").trim().slice(0, 120), subtitle: typeof raw?.subtitle === "string" ? raw.subtitle.trim().slice(0, 180) : undefined, slides };
}

function textBody(paragraphs: string[], fontSize: number, bold = false) {
  return paragraphs.map((paragraph) => `<a:p><a:r><a:rPr lang="zh-CN" sz="${fontSize}"${bold ? ' b="1"' : ""}/><a:t>${xml(paragraph)}</a:t></a:r><a:endParaRPr lang="zh-CN" sz="${fontSize}"/></a:p>`).join("");
}

function titleShape(id: number, text: string, y = 620000, h = 800000, size = 2600) {
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Title ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="800000" y="${y}"/><a:ext cx="10500000" cy="${h}"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square"/><a:lstStyle/>${textBody([text], size, true)}</p:txBody></p:sp>`;
}

function bodyShape(id: number, bullets: string[], source?: string) {
  const bulletParagraphs = bullets.map((bullet) => `<a:p><a:pPr marL="420000" indent="-220000"><a:buChar char="•"/></a:pPr><a:r><a:rPr lang="zh-CN" sz="1900"/><a:t>${xml(bullet)}</a:t></a:r><a:endParaRPr lang="zh-CN" sz="1900"/></a:p>`).join("");
  const sourceParagraph = source ? `<a:p><a:pPr/><a:r><a:rPr lang="zh-CN" sz="950" i="1"><a:solidFill><a:srgbClr val="6F7782"/></a:solidFill></a:rPr><a:t>${xml(`Source: ${source}`)}</a:t></a:r><a:endParaRPr lang="zh-CN" sz="950"/></a:p>` : "";
  return `<p:sp><p:nvSpPr><p:cNvPr id="${id}" name="Body ${id}"/><p:cNvSpPr txBox="1"/><p:nvPr/></p:nvSpPr><p:spPr><a:xfrm><a:off x="900000" y="1750000"/><a:ext cx="10300000" cy="4200000"/></a:xfrm><a:prstGeom prst="rect"><a:avLst/></a:prstGeom><a:noFill/><a:ln><a:noFill/></a:ln></p:spPr><p:txBody><a:bodyPr wrap="square" anchor="t"/><a:lstStyle/>${bulletParagraphs}${sourceParagraph}</p:txBody></p:sp>`;
}

function slideXml(slide: SlidePlan) {
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${titleShape(2, slide.title)}${bodyShape(3, slide.bullets, slide.source)}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

function titleSlideXml(title: string, subtitle?: string) {
  const subtitleShape = subtitle ? titleShape(3, subtitle, 2800000, 900000, 1500).replace(' b="1"', "") : "";
  return `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sld xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr>${titleShape(2, title, 1850000, 1200000, 3000)}${subtitleShape}</p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sld>`;
}

async function buildPptx(plan: DeckPlan) {
  const zip = new JSZip();
  const slideCount = plan.slides.length + 1;
  const overrides = Array.from({ length: slideCount }, (_, i) => `<Override PartName="/ppt/slides/slide${i + 1}.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slide+xml"/>`).join("");
  zip.file("[Content_Types].xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/><Override PartName="/ppt/slideMasters/slideMaster1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideMaster+xml"/><Override PartName="/ppt/slideLayouts/slideLayout1.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.slideLayout+xml"/><Override PartName="/ppt/theme/theme1.xml" ContentType="application/vnd.openxmlformats-officedocument.theme+xml"/><Override PartName="/docProps/core.xml" ContentType="application/vnd.openxmlformats-package.core-properties+xml"/><Override PartName="/docProps/app.xml" ContentType="application/vnd.openxmlformats-officedocument.extended-properties+xml"/>${overrides}</Types>`);
  zip.file("_rels/.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="ppt/presentation.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/package/2006/relationships/metadata/core-properties" Target="docProps/core.xml"/><Relationship Id="rId3" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/extended-properties" Target="docProps/app.xml"/></Relationships>`);
  zip.file("docProps/core.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><cp:coreProperties xmlns:cp="http://schemas.openxmlformats.org/package/2006/metadata/core-properties" xmlns:dc="http://purl.org/dc/elements/1.1/" xmlns:dcterms="http://purl.org/dc/terms/" xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance"><dc:title>${xml(plan.title)}</dc:title><dc:creator>XJTLU Campus Information Assistant</dc:creator><cp:lastModifiedBy>XJTLU Campus Information Assistant</cp:lastModifiedBy><dcterms:created xsi:type="dcterms:W3CDTF">${new Date().toISOString()}</dcterms:created></cp:coreProperties>`);
  zip.file("docProps/app.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Properties xmlns="http://schemas.openxmlformats.org/officeDocument/2006/extended-properties" xmlns:vt="http://schemas.openxmlformats.org/officeDocument/2006/docPropsVTypes"><Application>XJTLU Campus Information Assistant</Application><Slides>${slideCount}</Slides><PresentationFormat>Widescreen</PresentationFormat></Properties>`);

  const sldIds = Array.from({ length: slideCount }, (_, i) => `<p:sldId id="${256 + i}" r:id="rId${i + 2}"/>`).join("");
  zip.file("ppt/presentation.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:presentation xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:sldMasterIdLst><p:sldMasterId id="2147483648" r:id="rId1"/></p:sldMasterIdLst><p:sldIdLst>${sldIds}</p:sldIdLst><p:sldSz cx="12192000" cy="6858000" type="screen16x9"/><p:notesSz cx="6858000" cy="9144000"/></p:presentation>`);
  const relSlides = Array.from({ length: slideCount }, (_, i) => `<Relationship Id="rId${i + 2}" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slide" Target="slides/slide${i + 1}.xml"/>`).join("");
  zip.file("ppt/_rels/presentation.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="slideMasters/slideMaster1.xml"/>${relSlides}</Relationships>`);

  zip.file("ppt/slideMasters/slideMaster1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldMaster xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main"><p:cSld><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMap accent1="accent1" accent2="accent2" accent3="accent3" accent4="accent4" accent5="accent5" accent6="accent6" bg1="lt1" bg2="lt2" folHlink="folHlink" hlink="hlink" tx1="dk1" tx2="dk2"/><p:sldLayoutIdLst><p:sldLayoutId id="1" r:id="rId1"/></p:sldLayoutIdLst><p:txStyles><p:titleStyle/><p:bodyStyle/><p:otherStyle/></p:txStyles></p:sldMaster>`);
  zip.file("ppt/slideMasters/_rels/slideMaster1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/><Relationship Id="rId2" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/theme" Target="../theme/theme1.xml"/></Relationships>`);
  zip.file("ppt/slideLayouts/slideLayout1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><p:sldLayout xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships" xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" type="blank" preserve="1"><p:cSld name="Blank"><p:spTree><p:nvGrpSpPr><p:cNvPr id="1" name=""/><p:cNvGrpSpPr/><p:nvPr/></p:nvGrpSpPr><p:grpSpPr><a:xfrm><a:off x="0" y="0"/><a:ext cx="0" cy="0"/><a:chOff x="0" y="0"/><a:chExt cx="0" cy="0"/></a:xfrm></p:grpSpPr></p:spTree></p:cSld><p:clrMapOvr><a:masterClrMapping/></p:clrMapOvr></p:sldLayout>`);
  zip.file("ppt/slideLayouts/_rels/slideLayout1.xml.rels", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideMaster" Target="../slideMasters/slideMaster1.xml"/></Relationships>`);
  zip.file("ppt/theme/theme1.xml", `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><a:theme xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" name="XJTLU Theme"><a:themeElements><a:clrScheme name="XJTLU"><a:dk1><a:srgbClr val="19232D"/></a:dk1><a:lt1><a:srgbClr val="FFFFFF"/></a:lt1><a:dk2><a:srgbClr val="4F5965"/></a:dk2><a:lt2><a:srgbClr val="F6F7FA"/></a:lt2><a:accent1><a:srgbClr val="5B61E9"/></a:accent1><a:accent2><a:srgbClr val="2F8C71"/></a:accent2><a:accent3><a:srgbClr val="E3A65D"/></a:accent3><a:accent4><a:srgbClr val="A97BD8"/></a:accent4><a:accent5><a:srgbClr val="6E8CC7"/></a:accent5><a:accent6><a:srgbClr val="9B6E62"/></a:accent6><a:hlink><a:srgbClr val="5965D8"/></a:hlink><a:folHlink><a:srgbClr val="7A5AA6"/></a:folHlink></a:clrScheme><a:fontScheme name="XJTLU"><a:majorFont><a:latin typeface="Aptos Display"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:majorFont><a:minorFont><a:latin typeface="Aptos"/><a:ea typeface="Microsoft YaHei"/><a:cs typeface="Arial"/></a:minorFont></a:fontScheme><a:fmtScheme name="Office"><a:fillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:fillStyleLst><a:lnStyleLst><a:ln w="9525"><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:ln></a:lnStyleLst><a:effectStyleLst><a:effectStyle><a:effectLst/></a:effectStyle></a:effectStyleLst><a:bgFillStyleLst><a:solidFill><a:schemeClr val="phClr"/></a:solidFill></a:bgFillStyleLst></a:fmtScheme></a:themeElements></a:theme>`);

  zip.file("ppt/slides/slide1.xml", titleSlideXml(plan.title, plan.subtitle));
  for (let i = 0; i < plan.slides.length; i += 1) zip.file(`ppt/slides/slide${i + 2}.xml`, slideXml(plan.slides[i]));
  for (let i = 0; i < slideCount; i += 1) zip.file(`ppt/slides/_rels/slide${i + 1}.xml.rels`, `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/slideLayout" Target="../slideLayouts/slideLayout1.xml"/></Relationships>`);
  return zip.generateAsync({ type: "uint8array", compression: "DEFLATE" });
}

export async function POST(request: Request) {
  try {
    const { message, account, workspaceSlug, sessionId, slideCount = 7, language = "zh" } = await request.json();
    const topic = typeof message === "string" ? message.trim() : "";
    const slug = resolveWorkspaceSlug(account, workspaceSlug);
    const count = Math.max(4, Math.min(12, Number(slideCount) || 7));
    if (!topic) return NextResponse.json({ error: "请输入 PPT 主题。" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "当前知识库没有可用的 AnythingLLM Workspace。" }, { status: 400 });

    const prompt = `
用户主题：${topic}
目标页数：${count} 页内容页（封面由系统自动生成）
语言：${language === "en" ? "英文" : language === "bilingual" ? "中英双语" : "中文"}

请仅基于当前 Workspace 检索证据生成 PPT 内容计划。不要使用外部知识，不要虚构数据、案例或引用。
只返回合法 JSON，不要 Markdown：
{"title":"PPT标题","subtitle":"副标题或汇报目的","slides":[{"title":"页面标题","bullets":["要点1","要点2"],"source":"支持该页的来源标题/日期；无明确来源则写文档未明确说明"}]}

要求：
1. slides 尽量接近 ${count} 页，每页 3-5 个简洁要点。
2. 日期、数字、人名、机构名、URL 必须保持检索文档事实。
3. 首页之后应先说明背景/核心结论，再按逻辑展开，最后给出行动建议或总结；若主题不适合某种结构，不要硬套。
4. source 必须是本次检索中能支持该页的来源，不能杜撰。
5. PPT 将自动生成 .pptx，因此不要输出“建议自行制作”等说明。`;

    const result = await askAnythingLLM(slug, prompt, "query", sessionId);
    const plan = parsePlan(result.text, count);
    const bytes = await buildPptx(plan);
    const filename = `${plan.title.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80) || "xjtlu-briefing"}.pptx`;
    return new Response(bytes, {
      headers: {
        "Content-Type": "application/vnd.openxmlformats-officedocument.presentationml.presentation",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
        "X-Generated-Slides": String(plan.slides.length + 1),
        "X-Source-Count": String(result.citations.length),
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "PPT 生成失败。" }, { status: 500 });
  }
}
