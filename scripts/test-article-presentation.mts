import assert from "node:assert/strict";
import {
  formatArticlePublishedAt,
  normalizeArticleMarkdownForDisplay,
} from "../lib/article-presentation.ts";

const baseArticle = {
  title: "Article title",
  author: "ILEAD",
  account: "产业家学院与和谐管理研究中心",
  publishedAt: "2019-05-15T18:08:00",
  sourceUrl: "https://mp.weixin.qq.com/s/example?a=1&amp;b=2",
};

function normalize(content: string, overrides = {}) {
  return normalizeArticleMarkdownForDisplay({
    ...baseArticle,
    ...overrides,
    content,
  });
}

assert.equal(
  normalize("# Article   title\n\nFirst paragraph."),
  "First paragraph.",
  "a matching leading H1 should be removed",
);

assert.equal(
  normalize("Article *title*\n===\n\nFirst paragraph."),
  "First paragraph.",
  "a matching setext H1 should be removed after Markdown normalization",
);

const differentHeading = "# A different title\n\n> ILEAD · 产业家学院与和谐管理研究中心 · 2019-05-15 18:08\n\nBody";
assert.equal(
  normalize(differentHeading),
  differentHeading,
  "a different leading H1 and everything after it should be preserved",
);

assert.equal(
  normalize("> ILEAD · 产业家学院与和谐管理研究中心 · 2019-05-15 18:08\n\nBody"),
  "Body",
  "a leading attribution matching multiple structured fields should be removed",
);

const normalQuote = "> 产业家学院与和谐管理研究中心提出了一个值得讨论的问题。\n\nBody";
assert.equal(
  normalize(normalQuote),
  normalQuote,
  "a normal blockquote matching only one metadata field should be preserved",
);

const metadataNamesInProse = "> ILEAD 是产业家学院与和谐管理研究中心的重要项目。\n\nBody";
assert.equal(
  normalize(metadataNamesInProse),
  metadataNamesInProse,
  "multiple metadata names in ordinary prose should not be treated as attribution",
);

assert.equal(
  normalize("> [原文链接](https://mp.weixin.qq.com/s/example?a=1&b=2)\n\nBody"),
  "Body",
  "an original-source blockquote with the same URL should be removed",
);

const otherSource = "> [原文链接](https://mp.weixin.qq.com/s/a-different-article)\n\nBody";
assert.equal(
  normalize(otherSource),
  otherSource,
  "an original-source blockquote with a different URL should be preserved",
);

const untouchedTail = "Intro paragraph.\r\n\r\n# Later H1\r\n\r\n> A real quotation.\r\n";
assert.equal(
  normalize(
    "# Article title\r\n\r\n" +
      "> ILEAD · 产业家学院与和谐管理研究中心 · 2019-05-15 18:08\r\n\r\n" +
      "> [查看原文](https://mp.weixin.qq.com/s/example?a=1&b=2)\r\n\r\n" +
      untouchedTail,
  ),
  untouchedTail,
  "content after recognized leading elements should remain byte-for-byte unchanged",
);

assert.equal(formatArticlePublishedAt("2019-05-15T18:08:00"), "2019-05-15 18:08");
assert.equal(formatArticlePublishedAt("2019-05-15"), "2019-05-15");
assert.equal(formatArticlePublishedAt("unknown"), "unknown");

console.log("Article presentation fixtures passed.");
