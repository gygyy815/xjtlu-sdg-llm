export type MarkdownLanguageClassification =
  | "clearly_zh"
  | "clearly_en"
  | "ambiguous";

export type MarkdownLanguageAnalysis = {
  classification: MarkdownLanguageClassification;
  cjkCharacters: number;
  latinLetters: number;
  latinWords: number;
  visibleText: string;
};

export const LANGUAGE_THRESHOLDS = {
  clearlyEnMinimumLatinWords: 40,
  clearlyEnMinimumLatinLetters: 200,
  clearlyEnMaximumHanCharacters: 12,
  clearlyEnMinimumLatinLettersPerHan: 12,
  clearlyZhMinimumHanCharacters: 20,
  clearlyZhMinimumHanPerLatinLetters: 0.25,
} as const;

function stripInlineMarkdown(value: string) {
  let visible = "";

  for (let index = 0; index < value.length; index += 1) {
    const character = value[index];

    if (character === "`") {
      const markerLength = value.slice(index).match(/^`+/)?.[0].length ?? 1;
      const closing = value.indexOf("`".repeat(markerLength), index + markerLength);
      index = closing < 0 ? value.length : closing + markerLength - 1;
      visible += " ";
      continue;
    }

    const image = character === "!" && value[index + 1] === "[";
    const link = character === "[" || image;
    if (link) {
      const labelStart = index + (image ? 2 : 1);
      const labelEnd = value.indexOf("]", labelStart);
      if (labelEnd >= 0) {
        const targetStart = labelEnd + 1;
        if (value[targetStart] === "(") {
          let depth = 1;
          let cursor = targetStart + 1;
          while (cursor < value.length && depth > 0) {
            if (value[cursor] === "(") depth += 1;
            else if (value[cursor] === ")") depth -= 1;
            cursor += 1;
          }
          if (depth === 0) {
            if (!image) visible += value.slice(labelStart, labelEnd);
            visible += " ";
            index = cursor - 1;
            continue;
          }
        } else if (value[targetStart] === "[") {
          const referenceEnd = value.indexOf("]", targetStart + 1);
          if (referenceEnd >= 0) {
            if (!image) visible += value.slice(labelStart, labelEnd);
            visible += " ";
            index = referenceEnd;
            continue;
          }
        }
      }
    }

    visible += character;
  }

  return visible;
}

function isSourceMetadataBlockquote(line: string) {
  if (!/^ {0,3}>/.test(line) || line.length > 240) return false;
  const text = line.replace(/^ {0,3}(?:>\s*)+/, "");
  return /(?:原创|原文链接|文章来源|来源[:：]|作者[:：]|公众号[:：])/u.test(text);
}

/**
 * Extract text a reader can see while excluding code, URL/link/image targets,
 * comments, HTML tags, and Markdown punctuation. Only narrowly recognised
 * source-attribution blockquotes are ignored; ordinary quoted prose remains.
 */
export function extractVisibleMarkdownText(markdown: string) {
  const lines = markdown.replace(/<!--[\s\S]*?-->/g, " ").split("\n");
  const visibleLines: string[] = [];
  let fence: { marker: "`" | "~"; length: number } | undefined;

  for (const line of lines) {
    if (fence) {
      const closing = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (
        closing &&
        closing[1][0] === fence.marker &&
        closing[1].length >= fence.length
      ) {
        fence = undefined;
      }
      continue;
    }

    const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
    if (opening) {
      fence = {
        marker: opening[1][0] as "`" | "~",
        length: opening[1].length,
      };
      continue;
    }
    if (/^(?: {4}|\t)/.test(line) || isSourceMetadataBlockquote(line)) {
      continue;
    }
    if (/^\s*\[[^\]]+\]:\s*\S+/.test(line)) continue;

    const text = stripInlineMarkdown(line)
      .replace(/<https?:\/\/[^>]+>/gu, " ")
      .replace(/https?:\/\/[^\s<>"'`)\]]+/gu, " ")
      .replace(/<\/?[A-Za-z][^>]*>/gu, " ")
      .replace(/&[A-Za-z][A-Za-z0-9]+;/gu, " ")
      .replace(/^\s*(?:#{1,6}\s+|(?:>\s*)+|[-+*]\s+|\d+[.)]\s+)/u, "")
      .replace(/[*_~#>|]/gu, " ")
      .replace(/\s+/gu, " ")
      .trim();
    if (text && !/^(?:-{3,}|:{0,1}-{3,}:{0,1})$/u.test(text)) {
      visibleLines.push(text);
    }
  }

  return visibleLines.join("\n");
}

/**
 * Conservative deterministic guard:
 * - clearly_en needs at least 40 Latin words and 200 Latin letters, no more
 *   than 12 Han characters, and at least 12 Latin letters per Han character.
 * - clearly_zh needs at least 20 Han characters and Han characters equal to
 *   at least 25% of the Latin-letter count.
 * - everything else is ambiguous and remains eligible for translation.
 */
export function detectMarkdownLanguage(
  markdown: string,
): MarkdownLanguageAnalysis {
  const visibleText = extractVisibleMarkdownText(markdown);
  const cjkCharacters = visibleText.match(/\p{Script=Han}/gu)?.length ?? 0;
  const latinMatches = visibleText.match(/\p{Script=Latin}+/gu) ?? [];
  const latinLetters = latinMatches.reduce((sum, word) => sum + word.length, 0);
  const latinWords = latinMatches.length;

  let classification: MarkdownLanguageClassification = "ambiguous";
  if (
    latinWords >= LANGUAGE_THRESHOLDS.clearlyEnMinimumLatinWords &&
    latinLetters >= LANGUAGE_THRESHOLDS.clearlyEnMinimumLatinLetters &&
    cjkCharacters <= LANGUAGE_THRESHOLDS.clearlyEnMaximumHanCharacters &&
    latinLetters >=
      Math.max(1, cjkCharacters) *
        LANGUAGE_THRESHOLDS.clearlyEnMinimumLatinLettersPerHan
  ) {
    classification = "clearly_en";
  } else if (
    cjkCharacters >= LANGUAGE_THRESHOLDS.clearlyZhMinimumHanCharacters &&
    cjkCharacters >=
      latinLetters * LANGUAGE_THRESHOLDS.clearlyZhMinimumHanPerLatinLetters
  ) {
    classification = "clearly_zh";
  }

  return {
    classification,
    cjkCharacters,
    latinLetters,
    latinWords,
    visibleText,
  };
}
