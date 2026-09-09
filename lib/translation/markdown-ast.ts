import { fromMarkdown } from "mdast-util-from-markdown";
import { gfmTableFromMarkdown, gfmTableToMarkdown } from "mdast-util-gfm-table";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfmTable } from "micromark-extension-gfm-table";

type Node = {
  type: string;
  value?: string;
  alt?: string | null;
  children?: Node[];
};

export type MarkdownSegmentUnitType =
  | "paragraph"
  | "heading"
  | "list_item"
  | "blockquote"
  | "link_label"
  | "image_alt";
export type MarkdownTextSegment = {
  id: string;
  text: string;
  unitType?: MarkdownSegmentUnitType;
};
export type MarkdownSegmentBatch = readonly MarkdownTextSegment[];

export type TranslationSourceView = {
  markdown: string;
  ocrSectionsExcluded: number;
  ocrCharactersExcluded: number;
};

const FROM_MARKDOWN_OPTIONS = {
  extensions: [gfmTable()],
  mdastExtensions: [gfmTableFromMarkdown()],
};

const TO_MARKDOWN_OPTIONS = {
  extensions: [gfmTableToMarkdown()],
};

export function parseTranslationMarkdown(markdown: string) {
  return fromMarkdown(markdown, FROM_MARKDOWN_OPTIONS) as Node;
}

export function stringifyTranslationMarkdown(root: Node) {
  return toMarkdown(root as never, TO_MARKDOWN_OPTIONS);
}

const RETRIEVAL_OCR_DETAILS =
  /<details\s+data-sdg-ocr=(?:"true"|'true')\s*>\s*<summary>\s*图片 OCR 文字（检索用）\s*<\/summary>[\s\S]*?<\/details\s*>/giu;

/**
 * Build the reader-facing translation view without mutating canonical Markdown.
 * The deliberately narrow rule matches the exact enrichment wrapper used by
 * the production corpus; ordinary details blocks and prose mentioning OCR stay.
 */
export function extractTranslationSourceView(markdown: string): TranslationSourceView {
  let ocrSectionsExcluded = 0;
  let ocrCharactersExcluded = 0;
  const translatedView = markdown.replace(RETRIEVAL_OCR_DETAILS, (section) => {
    ocrSectionsExcluded += 1;
    ocrCharactersExcluded += [...section].length;
    return "";
  });
  return {
    markdown: translatedView,
    ocrSectionsExcluded,
    ocrCharactersExcluded,
  };
}

function isTranslatableText(value: unknown): value is string {
  return typeof value === "string" && /\p{Script=Han}/u.test(value);
}

function segmentUnitType(node: Node, parent?: Node): MarkdownSegmentUnitType {
  if (node.type === "heading") return "heading";
  if (node.type === "listItem" || parent?.type === "listItem") return "list_item";
  if (node.type === "blockquote" || parent?.type === "blockquote") return "blockquote";
  if (parent?.type === "link") return "link_label";
  return "paragraph";
}

function collectSegments(root: Node) {
  const targets: Array<{ node: Node; property: "value" | "alt"; ids: string[] }> = [];
  const segments: MarkdownTextSegment[] = [];
  let nextId = 1;
  const visit = (node: Node, parent?: Node, blocked = false) => {
    const nextBlocked = blocked || node.type === "code" || node.type === "inlineCode" || node.type === "html" || node.type === "definition";
    const addTarget = (
      property: "value" | "alt",
      value: string,
      unitType: MarkdownSegmentUnitType,
    ) => {
      const ids: string[] = [];
      const characters = [...value];
      const chunkSize = 1_200;
      for (let offset = 0; offset < characters.length;) {
        let end = Math.min(characters.length, offset + chunkSize);
        if (end < characters.length) {
          for (let candidate = end; candidate > Math.max(offset + 600, end - 100); candidate -= 1) {
            if (/[\s。！？；.!?;]/u.test(characters[candidate - 1] ?? "")) {
              end = candidate;
              break;
            }
          }
          while (end < characters.length && /\d/u.test(characters[end - 1] ?? "") && /\d/u.test(characters[end] ?? "")) {
            end += 1;
          }
        }
        const id = `SEG_${String(nextId++).padStart(4, "0")}`;
        ids.push(id);
        segments.push({ id, text: characters.slice(offset, end).join(""), unitType });
        offset = end;
      }
      targets.push({ node, property, ids });
    };
    if (!nextBlocked && node.type === "text" && isTranslatableText(node.value)) {
      addTarget("value", node.value, segmentUnitType(node, parent));
    }
    if (!nextBlocked && node.type === "image" && isTranslatableText(node.alt)) {
      addTarget("alt", node.alt, "image_alt");
    }
    node.children?.forEach((child) => visit(child, node, nextBlocked));
  };
  visit(root);
  return { targets, segments };
}

export function markdownTextSegments(markdown: string) {
  const root = parseTranslationMarkdown(markdown);
  return collectSegments(root).segments;
}

export function batchMarkdownSegments(
  segments: readonly MarkdownTextSegment[],
  maxCharacters = 1_200,
) {
  const batches: MarkdownSegmentBatch[] = [];
  let current: MarkdownTextSegment[] = [];
  let size = 0;
  for (const segment of segments) {
    const cost = [...segment.text].length + segment.id.length + 8;
    if (current.length && size + cost > maxCharacters) {
      batches.push(current);
      current = [];
      size = 0;
    }
    current.push(segment);
    size += cost;
  }
  if (current.length) batches.push(current);
  return batches;
}

export async function translateMarkdownAst(
  markdown: string,
  translateBatch: (batch: MarkdownSegmentBatch) => Promise<ReadonlyMap<string, string>>,
  maxCharacters = 3_000,
) {
  const root = parseTranslationMarkdown(markdown);
  const { targets, segments } = collectSegments(root);
  const translated = new Map<string, string>();
  for (const batch of batchMarkdownSegments(segments, maxCharacters)) {
    const result = await translateBatch(batch);
    for (const segment of batch) {
      const value = result.get(segment.id);
      if (typeof value !== "string") {
        throw new Error(`Translation provider omitted Markdown segment ${segment.id}`);
      }
      translated.set(segment.id, value);
    }
  }
  targets.forEach((target) => {
    (target.node as Record<string, unknown>)[target.property] = target.ids
      .map((id) => translated.get(id)!)
      .join("");
  });
  return stringifyTranslationMarkdown(root);
}

export function buildMarkdownSegmentSchema(expected: readonly MarkdownTextSegment[]) {
  const properties = Object.fromEntries(expected.map((segment) => [segment.id, { type: "string" }]));
  return {
    type: "object",
    properties,
    required: expected.map((segment) => segment.id),
    additionalProperties: false,
  } as const;
}

export function parseMarkdownSegmentResponse(value: unknown, expected: readonly MarkdownTextSegment[]) {
  if (value === null || typeof value !== "object" || Array.isArray(value)) {
    throw new Error("Translation API returned an invalid Markdown segment object");
  }
  const expectedIds = new Set(expected.map((segment) => segment.id));
  const output = new Map<string, string>();
  for (const [id, text] of Object.entries(value)) {
    if (!expectedIds.has(id)) throw new Error("Translation API returned an unknown Markdown segment ID");
    if (typeof text !== "string") throw new Error(`Translation API returned invalid text for Markdown segment ${id}`);
    output.set(id, text);
  }
  if (output.size !== expectedIds.size) throw new Error("Translation API omitted one or more Markdown segment IDs");
  return output;
}

/** Accept a JSON array even when a compatible model wraps it in prose or a code fence. */
export function parseMarkdownSegmentResponseText(
  text: string,
  expected: readonly MarkdownTextSegment[],
) {
  const candidates = [text.trim().replace(/^```(?:json)?\s*/iu, "").replace(/\s*```$/u, "")];
  const start = text.indexOf("[");
  const end = text.lastIndexOf("]");
  if (start >= 0 && end > start) candidates.push(text.slice(start, end + 1));
  const objectStart = text.indexOf("{");
  const objectEnd = text.lastIndexOf("}");
  if (objectStart >= 0 && objectEnd > objectStart) candidates.push(text.slice(objectStart, objectEnd + 1));
  for (const candidate of candidates) {
    try {
      const parsed = JSON.parse(candidate) as unknown;
      return parseMarkdownSegmentResponse(parsed, expected);
    } catch {
      // Try the next bounded JSON candidate, then report a stable error below.
    }
  }
  throw new Error("Translation API returned invalid Markdown segment JSON");
}
