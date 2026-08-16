import { fromMarkdown } from "mdast-util-from-markdown";
import { extractVisibleMarkdownText } from "./language.ts";

type MarkdownAstNode = {
  type: string;
  url?: string;
  identifier?: string;
  children?: MarkdownAstNode[];
};

type MarkdownStructure = {
  images: string[];
  links: string[];
  linkedImages: string[];
  interactiveNodes: string[];
};

function resolvedDestination(
  node: MarkdownAstNode,
  definitions: ReadonlyMap<string, string>,
) {
  if (typeof node.url === "string") return node.url;
  if (typeof node.identifier === "string") {
    return definitions.get(node.identifier.toLowerCase()) ??
      `[unresolved:${node.identifier.toLowerCase()}]`;
  }
  return "[missing-destination]";
}

function markdownStructure(markdown: string): MarkdownStructure {
  let root: MarkdownAstNode;
  try {
    root = fromMarkdown(markdown) as MarkdownAstNode;
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    throw new Error(`Could not parse Markdown for translation QA: ${message}`);
  }

  const definitions = new Map<string, string>();
  const collectDefinitions = (node: MarkdownAstNode) => {
    if (
      node.type === "definition" &&
      typeof node.identifier === "string" &&
      typeof node.url === "string"
    ) {
      definitions.set(node.identifier.toLowerCase(), node.url);
    }
    node.children?.forEach(collectDefinitions);
  };
  collectDefinitions(root);

  const structure: MarkdownStructure = {
    images: [],
    links: [],
    linkedImages: [],
    interactiveNodes: [],
  };

  const visit = (node: MarkdownAstNode, containingLink?: string) => {
    let childContainingLink = containingLink;
    if (node.type === "link" || node.type === "linkReference") {
      const destination = resolvedDestination(node, definitions);
      structure.links.push(destination);
      structure.interactiveNodes.push(`link:${destination}`);
      childContainingLink = destination;
    } else if (node.type === "image" || node.type === "imageReference") {
      const destination = resolvedDestination(node, definitions);
      structure.images.push(destination);
      structure.interactiveNodes.push(`image:${destination}`);
      if (containingLink !== undefined) {
        structure.linkedImages.push(`${containingLink}\n${destination}`);
      }
    }
    node.children?.forEach((child) => visit(child, childContainingLink));
  };
  visit(root);
  return structure;
}

function assertSameSequence(
  source: readonly string[],
  translated: readonly string[],
  description: string,
) {
  if (
    source.length !== translated.length ||
    source.some((value, index) => value !== translated[index])
  ) {
    throw new Error(
      `Translation provider changed the Markdown ${description} sequence ` +
        `(expected ${source.length}, received ${translated.length})`,
    );
  }
}

type FenceAnalysis = {
  count: number;
  balanced: boolean;
};

function analyzeCodeFences(markdown: string): FenceAnalysis {
  let active: { marker: "`" | "~"; length: number } | undefined;
  let count = 0;

  for (const line of markdown.split(/\r?\n/)) {
    if (active) {
      const closing = line.match(/^ {0,3}(`{3,}|~{3,})[ \t]*$/);
      if (
        closing &&
        closing[1][0] === active.marker &&
        closing[1].length >= active.length
      ) {
        active = undefined;
      }
      continue;
    }

    const opening = line.match(/^ {0,3}(`{3,}|~{3,})(?:[^`~].*)?$/);
    if (opening) {
      active = {
        marker: opening[1][0] as "`" | "~",
        length: opening[1].length,
      };
      count += 1;
    }
  }

  return { count, balanced: active === undefined };
}

/**
 * Compare semantic Markdown nodes while allowing all human-readable wording
 * and whitespace to change.
 */
export function assertMarkdownStructurePreserved(
  source: string,
  translated: string,
) {
  const sourceStructure = markdownStructure(source);
  const translatedStructure = markdownStructure(translated);

  assertSameSequence(
    sourceStructure.images,
    translatedStructure.images,
    "image destination",
  );
  assertSameSequence(
    sourceStructure.links,
    translatedStructure.links,
    "link destination",
  );
  assertSameSequence(
    sourceStructure.linkedImages,
    translatedStructure.linkedImages,
    "linked-image relationship",
  );
  assertSameSequence(
    sourceStructure.interactiveNodes,
    translatedStructure.interactiveNodes,
    "link/image node order",
  );

  const sourceFences = analyzeCodeFences(source);
  const translatedFences = analyzeCodeFences(translated);
  if (sourceFences.count !== translatedFences.count) {
    throw new Error(
      "Translation provider changed the Markdown fenced-code-block count",
    );
  }
  if (sourceFences.balanced !== translatedFences.balanced) {
    throw new Error(
      "Translation provider changed Markdown code-fence balance",
    );
  }
}

export const CHINESE_RESIDUE_HAN_THRESHOLD = 20;

export type ChineseResidueAnalysis = {
  suspicious: boolean;
  hanCharacters: number;
  mixedLatinHanTokens: string[];
};

/** Inspect reader-visible text while ignoring Markdown destinations and code. */
export function detectSuspiciousChineseResidue(
  translatedMarkdown: string,
): ChineseResidueAnalysis {
  const visibleText = extractVisibleMarkdownText(translatedMarkdown);
  const hanCharacters = visibleText.match(/\p{Script=Han}/gu)?.length ?? 0;
  const candidateTokens =
    visibleText.match(/[\p{Script=Latin}\p{Script=Han}\p{N}_-]+/gu) ?? [];
  const mixedLatinHanTokens = [
    ...new Set(
      candidateTokens.filter((token) => {
        const latinLetters = token.match(/\p{Script=Latin}/gu)?.length ?? 0;
        return latinLetters >= 2 && /\p{Script=Han}/u.test(token);
      }),
    ),
  ];

  return {
    suspicious:
      mixedLatinHanTokens.length > 0 ||
      hanCharacters >= CHINESE_RESIDUE_HAN_THRESHOLD,
    hanCharacters,
    mixedLatinHanTokens,
  };
}

export function assertNoSuspiciousChineseResidue(
  translatedMarkdown: string,
  field: "title" | "digest" | "content",
) {
  const analysis = detectSuspiciousChineseResidue(translatedMarkdown);
  if (!analysis.suspicious) return;

  const reason = analysis.mixedLatinHanTokens.length
    ? `mixed Latin/Han token ${JSON.stringify(analysis.mixedLatinHanTokens[0])}`
    : `${analysis.hanCharacters} remaining Han characters`;
  throw new Error(
    `Translation provider left suspicious Chinese residue in ${field}: ${reason}`,
  );
}
