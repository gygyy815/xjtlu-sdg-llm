import { NextResponse } from "next/server";
import Docxtemplater from "docxtemplater";
import PizZip from "pizzip";
import * as XLSX from "xlsx";

export const runtime = "nodejs";

function inspectDocx(buffer: Buffer) {
  const zip = new PizZip(buffer);
  const template = new Docxtemplater(zip, {
    paragraphLoop: true,
    linebreaks: true,
    delimiters: { start: "{{", end: "}}" },
  });
  const fields = [...new Set(
    template.getFullText().match(/\{\{\s*([^{}]+?)\s*\}\}/g)
      ?.map((token) => token.replace(/[{}]/g, "").trim()) || [],
  )];
  return fields.map((label) => ({ id: `docx:${label}`, label, kind: "docx" as const }));
}

function inspectXlsx(buffer: Buffer) {
  const book = XLSX.read(buffer, { type: "buffer", cellDates: true });
  const fields: { id: string; label: string; kind: "xlsx"; sheet: string; address: string }[] = [];

  for (const sheetName of book.SheetNames) {
    const sheet = book.Sheets[sheetName];
    const range = XLSX.utils.decode_range(sheet["!ref"] || "A1:A1");
    for (let row = range.s.r; row <= range.e.r; row++) {
      for (let col = Math.max(range.s.c + 1, 1); col <= range.e.c; col++) {
        const address = XLSX.utils.encode_cell({ r: row, c: col });
        if (sheet[address]?.v !== undefined && String(sheet[address]?.v).trim() !== "") continue;
        const labelAddress = XLSX.utils.encode_cell({ r: row, c: col - 1 });
        const rawLabel = sheet[labelAddress]?.v;
        if (typeof rawLabel !== "string" || !rawLabel.trim()) continue;
        const label = rawLabel.trim();
        if (/^(序号|serial|no\.?|status|状态|备注|notes?)$/i.test(label)) continue;
        fields.push({ id: `xlsx:${sheetName}:${address}`, label, kind: "xlsx", sheet: sheetName, address });
      }
    }
  }
  return fields.slice(0, 120);
}

export async function POST(request: Request) {
  try {
    const form = await request.formData();
    const file = form.get("file") as File | null;
    if (!file) return NextResponse.json({ error: "请选择文件。" }, { status: 400 });
    if (file.size > 10 * 1024 * 1024) return NextResponse.json({ error: "文件不能超过 10MB。" }, { status: 400 });

    const buffer = Buffer.from(await file.arrayBuffer());
    const extension = file.name.toLowerCase().split(".").pop();
    const fields = extension === "docx"
      ? inspectDocx(buffer)
      : extension === "xlsx"
        ? inspectXlsx(buffer)
        : null;

    if (!fields) return NextResponse.json({ error: "当前仅支持 .docx 和 .xlsx。" }, { status: 400 });
    if (!fields.length) return NextResponse.json({ error: "没有识别到可填写字段。请检查模板结构。" }, { status: 400 });
    return NextResponse.json({ fields });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "模板识别失败。" }, { status: 500 });
  }
}
