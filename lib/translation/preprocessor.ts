import { fromMarkdown } from "mdast-util-from-markdown";
import { createHash } from "node:crypto";
import { gfmTableFromMarkdown, gfmTableToMarkdown } from "mdast-util-gfm-table";
import { toMarkdown } from "mdast-util-to-markdown";
import { gfmTable } from "micromark-extension-gfm-table";
import type { MarkdownSegmentUnitType, MarkdownTextSegment } from "./markdown-ast.ts";

export const TRANSLATION_PROCESSING_VERSION = "v2.5-fastpath-checkpoint-1";

export function translationSegmentCheckpointKey(input: {
  segmentId: string;
  sourceText: string;
  contextHash: string;
  sourceLanguage: string;
  targetLanguage: string;
}) {
  return createHash("sha256")
    .update(JSON.stringify({ version: TRANSLATION_PROCESSING_VERSION, ...input }))
    .digest("hex");
}

type AstNode = {
  type: string;
  value?: string;
  alt?: string | null;
  url?: string;
  identifier?: string;
  children?: AstNode[];
};

export type TranslationViewSegment = MarkdownTextSegment & {
  type: "heading" | "paragraph" | "list-item" | "table-cell" | "link-label" | "alt";
};

export type TranslationViewExclusions = {
  ocrChars: number;
  boilerplateChars: number;
  duplicateChars: number;
  nonTranslatableChars: number;
};

export type TranslationView = {
  articleId?: string;
  sourceHash?: string;
  sourceMarkdown: string;
  /** Alias kept for callers that want to inspect the reader-facing source view. */
  markdown: string;
  segments: readonly TranslationViewSegment[];
  excluded: TranslationViewExclusions;
  reconstruct(translations: ReadonlyMap<string, string>): string;
};

const FROM_MARKDOWN_OPTIONS = {
  extensions: [gfmTable()],
  mdastExtensions: [gfmTableFromMarkdown()],
};
const TO_MARKDOWN_OPTIONS = { extensions: [gfmTableToMarkdown()] };

const OCR_SECTION_PATTERN =
  /^<details\s+data-sdg-ocr=(?:"true"|'true')\s*>\s*<summary>\s*图片 OCR 文字（检索用）\s*<\/summary>[\s\S]*?<\/details\s*>$/iu;

const BLOCK_TYPES = new Set([
  "paragraph",
  "heading",
  "listItem",
  "tableCell",
  "blockquote",
]);
const STRUCTURAL_TYPES = new Set(["code", "inlineCode", "html", "definition"]);

function hasHan(value: string) {
  return /\p{Script=Han}/u.test(value);
}

function visibleText(node: AstNode): string {
  if (node.type === "text" || node.type === "inlineCode") return node.value ?? "";
  if (node.type === "image") return node.alt ?? "";
  return (node.children ?? []).map(visibleText).join("");
}

function normalizeVisible(value: string) {
  return value.replace(/\s+/gu, " ").trim();
}

function isStandaloneBoilerplate(value: string) {
  const text = normalizeVisible(value);
  if (!text) return false;
  if (/^(?:阅读原文|点击阅读原文|长按识别二维码|扫码关注|关注公众号)$/u.test(text)) {
    return true;
  }
  return /^(?:编辑|审核|排版)[:：]\s*[\p{Script=Han}\p{L}\p{N} .·&'’()（）_-]{1,80}$/u.test(text);
}

function isPurePunctuation(value: string) {
  return /^[\p{P}\p{S}\s]+$/u.test(value);
}

function isPureNumericOrDate(value: string) {
  const text = value.trim();
  return /\d/u.test(text) && /^[\d\s.,:;!?%+\-–—~至到年月日时分秒周第()（）【】[\]/]+$/u.test(text);
}

function isPassthroughText(value: string) {
  const text = value.trim();
  return !text || isPurePunctuation(text) || isPureNumericOrDate(text) || !hasHan(text);
}

function unitType(node: AstNode, parent?: AstNode): MarkdownSegmentUnitType {
  if (node.type === "heading") return "heading";
  if (node.type === "listItem" || parent?.type === "listItem") return "list_item";
  if (node.type === "blockquote" || parent?.type === "blockquote") return "blockquote";
  if (parent?.type === "link" || parent?.type === "linkReference") return "link_label";
  return "paragraph";
}

function segmentType(node: AstNode, parent?: AstNode): TranslationViewSegment["type"] {
  if (node.type === "image") return "alt";
  if (parent?.type === "tableCell") return "table-cell";
  if (node.type === "heading") return "heading";
  if (node.type === "listItem" || parent?.type === "listItem") return "list-item";
  if (parent?.type === "link" || parent?.type === "linkReference") return "link-label";
  return "paragraph";
}

function countCharacters(value: string) {
  return [...value].length;
}

/**
 * Build an ephemeral, deterministic translation view. It parses canonical
 * Markdown into an isolated AST and never mutates the source string or file.
 */
export function buildTranslationView(
  markdown: string,
  options: { articleId?: string; sourceHash?: string } = {},
): TranslationView {
  const root = fromMarkdown(markdown, FROM_MARKDOWN_OPTIONS) as AstNode;
  const segments: TranslationViewSegment[] = [];
  const targets: Array<{ node: AstNode; property: "value" | "alt"; ids: string[] }> = [];
  const seenText = new Map<string, string[]>();
  const bareUrlPlaceholders = new Map<string, string>();
  const excluded: TranslationViewExclusions = {
    ocrChars: 0,
    boilerplateChars: 0,
    duplicateChars: 0,
    nonTranslatableChars: 0,
  };
  let nextId = 1;

  const addTarget = (
    node: AstNode,
    property: "value" | "alt",
    value: string,
    parent: AstNode | undefined,
  ) => {
    const originalText = value ?? "";
    let bareUrlIndex = 0;
    const text = originalText.replace(/https?:\/\/[^\s<>"'`]+/gu, (match) => {
      const trailing = match.match(/[),.;:!?。，；：！？）】》]+$/u)?.[0] ?? "";
      const url = trailing ? match.slice(0, -trailing.length) : match;
      const placeholder = `XJTLUBAREURL${String(bareUrlPlaceholders.size).padStart(4, "0")}`;
      bareUrlPlaceholders.set(placeholder, url);
      bareUrlIndex += [...url].length;
      return `${placeholder}${trailing}`;
    });
    if (bareUrlIndex) excluded.nonTranslatableChars += bareUrlIndex;
    if (isPassthroughText(text)) {
      excluded.nonTranslatableChars += countCharacters(text);
      return;
    }
    const key = normalizeVisible(originalText).replace(/https?:\/\/[^\s<>"'`]+/gu, "<URL>");
    const prior = key.length >= 12 ? seenText.get(key) : undefined;
    if (prior) {
      excluded.duplicateChars += countCharacters(text);
      targets.push({ node, property, ids: [...prior] });
      return;
    }

    const ids: string[] = [];
    const characters = [...text];
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
      }
      const id = `SEG_${String(nextId++).padStart(4, "0")}`;
      ids.push(id);
      segments.push({ id, text: characters.slice(offset, end).join(""), unitType: unitType(node, parent), type: segmentType(node, parent) });
      offset = end;
    }
    if (key.length >= 12) seenText.set(key, [...ids]);
    targets.push({ node, property, ids });
  };

  const visit = (node: AstNode, parent?: AstNode, blocked = false) => {
    const raw = node.type === "html" ? node.value ?? "" : "";
    if (OCR_SECTION_PATTERN.test(raw)) {
      excluded.ocrChars += countCharacters(raw);
      return;
    }
    const nextBlocked = blocked || STRUCTURAL_TYPES.has(node.type);
    if (nextBlocked) {
      if (node.value) excluded.nonTranslatableChars += countCharacters(node.value);
      return;
    }
    if (BLOCK_TYPES.has(node.type) && isStandaloneBoilerplate(visibleText(node))) {
      excluded.boilerplateChars += countCharacters(visibleText(node));
      return;
    }
    if (node.type === "text" && typeof node.value === "string") {
      addTarget(node, "value", node.value, parent);
      return;
    }
    if (node.type === "image" && typeof node.alt === "string") {
      addTarget(node, "alt", node.alt, parent);
      return;
    }
    node.children?.forEach((child) => visit(child, node, nextBlocked));
  };
  visit(root);

  return {
    ...options,
    sourceMarkdown: markdown,
    markdown,
    segments,
    excluded,
    reconstruct(translations) {
      for (const target of targets) {
        const value = target.ids.map((id) => translations.get(id) ?? "").join("");
        if (value) (target.node as Record<string, unknown>)[target.property] = value;
      }
      let reconstructed = toMarkdown(root as never, TO_MARKDOWN_OPTIONS);
      for (const [placeholder, url] of bareUrlPlaceholders) reconstructed = reconstructed.split(placeholder).join(url);
      return reconstructed;
    },
  };
}

export function translationViewCharacters(view: TranslationView) {
  return {
    sourceChars: countCharacters(view.sourceMarkdown),
    translatableChars: view.segments.reduce((sum, segment) => sum + countCharacters(segment.text), 0),
    ...view.excluded,
  };
}
