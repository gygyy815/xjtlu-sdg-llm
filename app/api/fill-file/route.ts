import { NextResponse } from "next/server";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import * as XLSX from "xlsx";
import { askAnythingLLM, workspaceMap } from "@/lib/anythingllm";

export const runtime = "nodejs";

function safeJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("模型没有返回可用于填表的 JSON。请重试或减少待填字段。 ");
  return JSON.parse(match[0]) as Record<string, string>;
}

async function fillDocx(buffer: Buffer, slug: string, instruction: string) {
  const zip = new PizZip(buffer);
  const template = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: "{{", end: "}}" } });
  const fields = [...new Set(template.getFullText().match(/\{\{\s*([^{}]+?)\s*\}\}/g)?.map(token => token.replace(/[{}]/g, "").trim()) || [])];
  if (!fields.length) throw new Error("Word 模板中没有找到 {{字段名}} 占位符。 ");
  const prompt = `Use the knowledge base to fill this template. ${instruction}\nFields: ${fields.join(", ")}\nReturn ONLY one JSON object whose keys exactly match the fields. If evidence is missing, use 文档未明确说明.`;
  const values = safeJson((await askAnythingLLM(slug, prompt)).text);
  template.render(Object.fromEntries(fields.map(field => [field, String(values[field] ?? "文档未明确说明")])));
  return template.getZip().generate({ type: "nodebuffer" });
}

async function fillXlsx(buffer: Buffer, slug: string, instruction: string) {
  const book = XLSX.read(buffer, { type: "buffer", cellDates: true });
  for (const sheetName of book.SheetNames) {
    const sheet = book.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    const targets: { key: string; address: string }[] = [];
    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = range.s.c; col <= range.e.c; col++) {
        const address = XLSX.utils.encode_cell({ r: row, c: col });
        if (sheet[address]?.v !== undefined) continue;
        const label = col > 0 ? sheet[XLSX.utils.encode_cell({ r: row, c: col - 1 })]?.v : undefined;
        if (typeof label === "string" && label.trim()) targets.push({ key: `${sheetName}!${address}`, address });
      }
    }
    if (!targets.length) continue;
    const labels = targets.map(t => `${t.key}: ${sheet[XLSX.utils.encode_cell({ r: XLSX.utils.decode_cell(t.address).r, c: XLSX.utils.decode_cell(t.address).c - 1 })]?.v}`);
    const prompt = `Fill the blank spreadsheet fields from the knowledge base. ${instruction}\nReturn ONLY a JSON object using these exact keys:\n${labels.join("\n")}\nIf evidence is missing, use 文档未明确说明.`;
    const values = safeJson((await askAnythingLLM(slug, prompt)).text);
    for (const target of targets) if (values[target.key] !== undefined) sheet[target.address] = { t: "s", v: String(values[target.key]) };
  }
  return Buffer.from(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    const account = String(form.get("account") || "");
    const instruction = String(form.get("instruction") || "请根据知识库准确填写，不要推断。 ");
    const slug = workspaceMap()[account];
    if (!file || !slug) return NextResponse.json({ error: "文件或公众号知识库无效。" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "文件不能超过 10MB。" }, { status: 400 });
    const input = Buffer.from(await file.arrayBuffer());
    const extension = file.name.toLowerCase().split(".").pop();
    const output = extension === "docx" ? await fillDocx(input, slug, instruction) : extension === "xlsx" ? await fillXlsx(input, slug, instruction) : null;
    if (!output) return NextResponse.json({ error: "当前仅支持 .docx 和 .xlsx。" }, { status: 400 });
    const filename = `filled-${file.name}`;
    return new Response(new Uint8Array(output), { headers: { "Content-Type": "application/octet-stream", "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}` } });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "文件处理失败。" }, { status: 500 });
  }
}
