import { NextResponse } from "next/server";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import * as XLSX from "xlsx";
import { askAnythingLLM, workspaceMap } from "@/lib/anythingllm";

export const runtime = "nodejs";

const evidenceRules = `
Evidence rules:
1. Choose one most relevant source article and keep all fields consistent with that same article unless the user explicitly asks to combine multiple sources.
2. Copy dates, times, names, email addresses and URLs exactly. Never infer an audience, deadline or location.
3. For a source/account field, return only the publisher name; do not append publication time or location.
4. For registration/participation, include every explicit step plus any email, link or contact detail in the source.
5. Keywords must describe concepts explicitly present in the selected article. Do not add related concepts from other articles.
6. When the selected source does not explicitly support a field, return exactly 文档未明确说明.
7. Do not perform SDG classification in this workflow.
`;

function safeJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("模型没有返回可用于填表的 JSON。请重试或减少待填字段。");
  return JSON.parse(match[0]) as Record<string, string>;
}

function parseSelectedIds(raw: FormDataEntryValue | null) {
  if (!raw) return new Set<string>();
  try {
    const value = JSON.parse(String(raw));
    return new Set(Array.isArray(value) ? value.map(String) : []);
  } catch {
    return new Set<string>();
  }
}

async function fillDocx(buffer: Buffer, slug: string, instruction: string, selectedIds: Set<string>) {
  const zip = new PizZip(buffer);
  const template = new Docxtemplater(zip, { paragraphLoop: true, linebreaks: true, delimiters: { start: "{{", end: "}}" } });
  const allFields = [...new Set(template.getFullText().match(/\{\{\s*([^{}]+?)\s*\}\}/g)?.map((token) => token.replace(/[{}]/g, "").trim()) || [])];
  if (!allFields.length) throw new Error("Word 模板中没有找到 {{字段名}} 占位符。");

  const fields = selectedIds.size
    ? allFields.filter((field) => selectedIds.has(`docx:${field}`))
    : allFields;
  if (!fields.length) throw new Error("没有选择可填写的 Word 字段。");

  const prompt = `Use the knowledge base to fill this template. ${instruction}\n${evidenceRules}\nFields: ${fields.join(", ")}\nReturn ONLY one valid JSON object whose keys exactly match the fields.`;
  const values = safeJson((await askAnythingLLM(slug, prompt)).text);

  const renderValues: Record<string, string> = {};
  for (const field of allFields) {
    if (fields.includes(field)) renderValues[field] = String(values[field] ?? "文档未明确说明");
    else renderValues[field] = `{{${field}}}`;
  }
  template.render(renderValues);
  return template.getZip().generate({ type: "nodebuffer" });
}

async function fillXlsx(buffer: Buffer, slug: string, instruction: string, selectedIds: Set<string>) {
  const book = XLSX.read(buffer, { type: "buffer", cellDates: true });
  for (const sheetName of book.SheetNames) {
    const sheet = book.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    const targets: { key: string; address: string; label: string }[] = [];

    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = Math.max(range.s.c + 1, 1); col <= range.e.c; col++) {
        const address = XLSX.utils.encode_cell({ r: row, c: col });
        if (sheet[address]?.v !== undefined && String(sheet[address]?.v).trim() !== "") continue;
        const label = sheet[XLSX.utils.encode_cell({ r: row, c: col - 1 })]?.v;
        if (typeof label !== "string" || !label.trim()) continue;
        const trimmed = label.trim();
        if (/^(序号|serial|no\.?|status|状态|备注|notes?)$/i.test(trimmed)) continue;
        const id = `xlsx:${sheetName}:${address}`;
        if (selectedIds.size && !selectedIds.has(id)) continue;
        targets.push({ key: id, address, label: trimmed });
      }
    }

    if (!targets.length) continue;
    const prompt = `Fill the selected blank spreadsheet fields from the knowledge base. ${instruction}\n${evidenceRules}\nReturn ONLY one valid JSON object using these exact keys:\n${targets.map((target) => `${target.key}: ${target.label}`).join("\n")}`;
    const values = safeJson((await askAnythingLLM(slug, prompt)).text);
    for (const target of targets) {
      sheet[target.address] = { t: "s", v: String(values[target.key] ?? "文档未明确说明") };
    }
  }
  return Buffer.from(XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    const account = String(form.get("account") || "");
    const instruction = String(form.get("instruction") || "请根据知识库准确填写，不要推断。");
    const selectedIds = parseSelectedIds(form.get("selectedIds"));
    const slug = workspaceMap()[account];

    if (!file || !slug) return NextResponse.json({ error: "文件或公众号知识库无效。" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "文件不能超过 10MB。" }, { status: 400 });

    const input = Buffer.from(await file.arrayBuffer());
    const extension = file.name.toLowerCase().split(".").pop();
    const output = extension === "docx"
      ? await fillDocx(input, slug, instruction, selectedIds)
      : extension === "xlsx"
        ? await fillXlsx(input, slug, instruction, selectedIds)
        : null;

    if (!output) return NextResponse.json({ error: "当前仅支持 .docx 和 .xlsx。" }, { status: 400 });
    const filename = `filled-${file.name}`;
    return new Response(new Uint8Array(output), {
      headers: {
        "Content-Type": "application/octet-stream",
        "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(filename)}`,
      },
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "文件处理失败。" }, { status: 500 });
  }
}
