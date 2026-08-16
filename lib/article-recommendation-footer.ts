import { fromMarkdown } from "mdast-util-from-markdown";

type MarkdownNode = {
  type: string;
  value?: string;
  url?: string;
  children?: MarkdownNode[];
  position?: {
    start: { offset?: number };
    end: { offset?: number };
  };
};

function decodeBasicHtmlEntities(value: string) {
  return value.replace(/&amp;/gi, "&");
}

function parsedHttpUrl(value: string) {
  try {
    const parsed = new URL(decodeBasicHtmlEntities(value));
    return parsed.protocol === "http:" || parsed.protocol === "https:"
      ? parsed
      : undefined;
  } catch {
    return undefined;
  }
}

function isWechatImageUrl(value: string) {
  const parsed = parsedHttpUrl(value);
  return (
    parsed !== undefined &&
    (parsed.hostname === "mmbiz.qpic.cn" ||
      parsed.hostname.endsWith(".mmbiz.qpic.cn"))
  );
}

function isWechatArticleUrl(value: string) {
  const parsed = parsedHttpUrl(value);
  return (
    parsed !== undefined &&
    parsed.hostname === "mp.weixin.qq.com" &&
    (parsed.pathname === "/s" || parsed.pathname.startsWith("/s/"))
  );
}

function nodeText(node: MarkdownNode): string {
  if (node.type === "image" || node.type === "imageReference") return "";
  if (typeof node.value === "string") return node.value;
  return node.children?.map(nodeText).join("") ?? "";
}

function nodeDestinations(node: MarkdownNode) {
  const images: string[] = [];
  const links: string[] = [];

  const visit = (current: MarkdownNode) => {
    if (
      (current.type === "image" || current.type === "imageReference") &&
      typeof current.url === "string"
    ) {
      images.push(current.url);
    } else if (
      (current.type === "link" || current.type === "linkReference") &&
      typeof current.url === "string"
    ) {
      links.push(current.url);
    }
    current.children?.forEach(visit);
  };
  visit(node);
  return { images, links };
}

function rawHttpUrls(value: string) {
  return (value.match(/https?:\/\/[^\s<>"'`]+/g) ?? []).map((url) =>
    url.replace(/[\])},.!?，。；;]+$/u, ""),
  );
}

function isRecommendationCard(node: MarkdownNode, source: string) {
  const start = node.position?.start.offset;
  const end = node.position?.end.offset;
  if (start === undefined || end === undefined) return false;

  const raw = source.slice(start, end);
  const { images, links } = nodeDestinations(node);
  const hasWechatImage = images.some(isWechatImageUrl);
  const hasWechatArticleLink =
    links.some(isWechatArticleUrl) ||
    rawHttpUrls(raw).some(isWechatArticleUrl);
  return hasWechatImage && hasWechatArticleLink;
}

function normalizedBlockText(node: MarkdownNode) {
  return nodeText(node)
    .normalize("NFKC")
    .replace(/\s+/g, " ")
    .trim()
    .toLocaleLowerCase();
}

function isRecommendationHeading(node: MarkdownNode) {
  if (node.type !== "heading" && node.type !== "paragraph") return false;
  const text = normalizedBlockText(node).replace(/[：:!！.。]+$/u, "").trim();
  return /^(?:推荐阅读|相关阅读|延伸阅读|更多阅读|read more|recommended reading|recommended articles|related reading|related articles|you may also like)$/u.test(
    text,
  );
}

function isCreditsBlock(node: MarkdownNode) {
  if (node.type !== "paragraph") return false;
  const lines = nodeText(node)
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.some((line) =>
    /^(?:(?:记者|责编|编辑|新媒体(?:编辑)?|监制|摄影|图片(?:来源)?|排版|撰文|作者)\s*[：:]|(?:reporter|writer|author|editor|social media editor|photography|producer|copy editor)\s*[：:]|edited by\s+|photos? courtesy of\s+)/iu.test(
      line,
    ),
  );
}

function reachesDocumentTail(index: number, blockCount: number) {
  return index >= blockCount - 3;
}

function expandOverStrayOpeningBracket(
  blocks: MarkdownNode[],
  source: string,
  startIndex: number,
) {
  let index = startIndex;
  while (index > 0) {
    const previous = blocks[index - 1];
    const start = previous.position?.start.offset;
    const end = previous.position?.end.offset;
    if (start === undefined || end === undefined) break;
    if (!/^\s*\[\s*$/u.test(source.slice(start, end))) break;
    index -= 1;
  }
  return index;
}

/**
 * Remove only a high-confidence WeChat recommendation-card suffix. Core body
 * images and links are untouched unless repeated card structure, an explicit
 * recommendation heading, or nearby credits makes the final tail clear.
 */
export function removeWechatRecommendationFooterForDisplay(markdown: string) {
  if (!markdown.trim()) return markdown;

  let root: MarkdownNode;
  try {
    root = fromMarkdown(markdown) as MarkdownNode;
  } catch {
    return markdown;
  }
  const blocks = root.children ?? [];
  if (blocks.length === 0) return markdown;

  const cardIndexes = blocks.flatMap((block, index) =>
    isRecommendationCard(block, markdown) ? [index] : [],
  );
  if (cardIndexes.length === 0) return markdown;

  const candidates: number[] = [];

  for (let index = 0; index < blocks.length; index += 1) {
    if (!isRecommendationHeading(blocks[index])) continue;
    const followingCard = cardIndexes.find(
      (cardIndex) => cardIndex > index && cardIndex - index <= 6,
    );
    if (
      followingCard !== undefined &&
      reachesDocumentTail(followingCard, blocks.length)
    ) {
      candidates.push(index);
    }
  }

  let groupStart = 0;
  for (let index = 1; index <= cardIndexes.length; index += 1) {
    const continues =
      index < cardIndexes.length &&
      cardIndexes[index] - cardIndexes[index - 1] <= 4;
    if (continues) continue;

    const group = cardIndexes.slice(groupStart, index);
    const first = group[0];
    const last = group.at(-1)!;
    if (
      group.length >= 2 &&
      first > 0 &&
      reachesDocumentTail(last, blocks.length)
    ) {
      candidates.push(
        expandOverStrayOpeningBracket(blocks, markdown, first),
      );
    }
    groupStart = index;
  }

  for (const cardIndex of cardIndexes) {
    const nearbyCredits = blocks
      .slice(Math.max(0, cardIndex - 5), cardIndex)
      .some(isCreditsBlock);
    if (
      nearbyCredits &&
      reachesDocumentTail(cardIndex, blocks.length)
    ) {
      candidates.push(
        expandOverStrayOpeningBracket(blocks, markdown, cardIndex),
      );
    }
  }

  if (candidates.length === 0) return markdown;
  const startBlock = blocks[Math.min(...candidates)];
  const startOffset = startBlock.position?.start.offset;
  return startOffset === undefined
    ? markdown
    : markdown.slice(0, startOffset).trimEnd();
}
