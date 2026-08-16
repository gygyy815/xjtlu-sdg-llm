export type MarkdownTranslationPart = {
  kind: "translate" | "passthrough";
  content: string;
};

const DEFAULT_MAX_CHUNK_CHARACTERS = 6_000;

function markdownUrls(markdown: string) {
  return markdown.match(/https?:\/\/[^\s<>"'`]+/g) ?? [];
}

/** Reject output if any URL changed, moved, appeared, or disappeared. */
export function assertMarkdownUrlsPreserved(source: string, translated: string) {
  const sourceUrls = markdownUrls(source);
  const translatedUrls = markdownUrls(translated);
  if (
    sourceUrls.length !== translatedUrls.length ||
    sourceUrls.some((url, index) => url !== translatedUrls[index])
  ) {
    throw new Error("Translation provider changed the Markdown URL sequence");
  }
}

type MarkdownPiece = {
  content: string;
  separator: boolean;
};

function splitAtMarkdownBlockBoundaries(markdown: string): MarkdownPiece[] {
  if (!markdown) return [];

  const lines = markdown.match(/[^\n]*(?:\n|$)/g)?.filter(Boolean) ?? [];
  const pieces: MarkdownPiece[] = [];
  let buffer = "";
  let bufferIsSeparator: boolean | undefined;
  let fence: { marker: "`" | "~"; length: number } | undefined;

  const flush = () => {
    if (!buffer) return;
    pieces.push({ content: buffer, separator: bufferIsSeparator === true });
    buffer = "";
    bufferIsSeparator = undefined;
  };

  for (const line of lines) {
    const trimmed = line.replace(/\n$/, "").trim();
    const isBlankOutsideFence = !fence && trimmed === "";
    if (
      bufferIsSeparator !== undefined &&
      bufferIsSeparator !== isBlankOutsideFence
    ) {
      flush();
    }
    bufferIsSeparator = isBlankOutsideFence;
    buffer += line;

    if (!fence) {
      const opening = line.match(/^ {0,3}(`{3,}|~{3,})/);
      if (opening) {
        fence = {
          marker: opening[1][0] as "`" | "~",
          length: opening[1].length,
        };
      }
    } else {
      const closing = line.match(/^ {0,3}(`{3,}|~{3,})\s*$/);
      if (
        closing &&
        closing[1][0] === fence.marker &&
        closing[1].length >= fence.length
      ) {
        fence = undefined;
      }
    }
  }
  flush();
  return pieces;
}

function stripContainerPrefix(line: string) {
  return line
    .replace(/^\s*(?:>\s*)+/, "")
    .replace(/^\s*(?:[-+*]|\d+[.)])\s+/, "")
    .trim();
}

/** True when a block has no prose worth sending to a translation model. */
export function isPassthroughMarkdownBlock(block: string) {
  const trimmed = block.trim();
  if (!trimmed) return true;
  if (/^ {0,3}(`{3,}|~{3,})/.test(block)) return true;
  if (/^\s*<!--[\s\S]*-->\s*$/.test(block)) return true;
  if (/^(?: {4}|\t)/.test(block)) return true;

  const meaningfulLines = trimmed.split("\n").map(stripContainerPrefix);
  if (
    meaningfulLines.every((line) =>
      /^(?:!\[[^\]]*\]\([^\n)]*\)|!\[[^\]]*\]\[[^\]]*\])$/.test(line),
    )
  ) {
    return true;
  }
  if (
    meaningfulLines.every((line) =>
      /^(?:https?:\/\/\S+|<https?:\/\/[^>]+>)$/.test(line),
    )
  ) {
    return true;
  }
  if (
    meaningfulLines.every((line) =>
      /^(?:[-*_]{3,}|#{1,6}|\[[^\]]+\]:\s*\S+|<\/?[A-Za-z][^>]*>|\|?(?:\s*:?-{3,}:?\s*\|)+)$/.test(
        line,
      ),
    )
  ) {
    return true;
  }
  return false;
}

function appendPart(
  parts: MarkdownTranslationPart[],
  kind: MarkdownTranslationPart["kind"],
  content: string,
) {
  if (!content) return;
  const previous = parts.at(-1);
  if (previous?.kind === kind) previous.content += content;
  else parts.push({ kind, content });
}

/**
 * Build an exact, reconstructable plan. Translatable prose is grouped up to a
 * soft size limit, but chunks are never cut inside a Markdown block/paragraph.
 */
export function planMarkdownTranslation(
  markdown: string,
  maxChunkCharacters = DEFAULT_MAX_CHUNK_CHARACTERS,
): MarkdownTranslationPart[] {
  if (!Number.isSafeInteger(maxChunkCharacters) || maxChunkCharacters < 1) {
    throw new Error("maxChunkCharacters must be a positive integer");
  }

  const pieces = splitAtMarkdownBlockBoundaries(markdown);
  const parts: MarkdownTranslationPart[] = [];
  let chunk = "";
  let pendingSeparator = "";

  const flushChunk = () => {
    appendPart(parts, "translate", chunk);
    chunk = "";
  };

  for (const piece of pieces) {
    if (piece.separator) {
      pendingSeparator += piece.content;
      continue;
    }

    if (isPassthroughMarkdownBlock(piece.content)) {
      flushChunk();
      appendPart(parts, "passthrough", pendingSeparator + piece.content);
      pendingSeparator = "";
      continue;
    }

    const candidate = chunk + pendingSeparator + piece.content;
    if (chunk && candidate.length > maxChunkCharacters) {
      flushChunk();
      appendPart(parts, "passthrough", pendingSeparator);
      pendingSeparator = "";
    }
    chunk += pendingSeparator + piece.content;
    pendingSeparator = "";
  }

  flushChunk();
  appendPart(parts, "passthrough", pendingSeparator);
  return parts;
}

