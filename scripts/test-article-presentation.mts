import assert from "node:assert/strict";
import {
  formatArticlePublishedAt,
  normalizeArticleMarkdownForDisplay,
} from "../lib/article-presentation.ts";
import { resolveArticleDetailLanguage } from "../lib/article-detail-language.ts";

const baseArticle = {
  title: "Article title",
  author: "ILEAD",
  account: "产业家学院与和谐管理研究中心",
  publishedAt: "2019-05-15T18:08:00",
  sourceUrl: "https://mp.weixin.qq.com/s/example?a=1&amp;b=2",
};

function normalize(content: string, overrides = {}, options = {}) {
  return normalizeArticleMarkdownForDisplay(
    {
      ...baseArticle,
      ...overrides,
      content,
    },
    options,
  );
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

assert.equal(
  normalize(
    "# From the Silk Road Bicycle Ride from Suzhou to Liverpool, He Had a Warm Stop at Xi'an Jiaotong-Liverpool University!\n\nEnglish body.",
    {
      title:
        "Cycling the Silk Road from Suzhou to Liverpool: A Warm Stop at Xi'an Jiaotong University",
    },
    { translatedContent: true },
  ),
  "English body.",
  "a high-confidence translated title variant should be removed",
);

const genuineTranslatedSection =
  "# Programme Details\n\nThe article begins with a genuine section heading.";
assert.equal(
  normalize(
    genuineTranslatedSection,
    {
      title:
        "Cycling the Silk Road from Suzhou to Liverpool: A Warm Stop at Xi'an Jiaotong University",
    },
    { translatedContent: true },
  ),
  genuineTranslatedSection,
  "a genuinely different first translated heading should be preserved",
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

assert.equal(
  normalize("> [Original Link](https://mp.weixin.qq.com/s/example?a=1&b=2)\n\nBody"),
  "Body",
  "a translated original-source blockquote with the same URL should be removed",
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

const wechatImage = (id: string) =>
  `https://mmbiz.qpic.cn/mmbiz_jpg/example/${id}/640`;
const wechatArticle = (id: string) =>
  `https://mp.weixin.qq.com/s?__biz=example&mid=${id}`;
const recommendationCard = (id: string, title: string) =>
  [
    "[",
    `![](${wechatImage(id)})`,
    `](${wechatArticle(id)})`,
    "",
    title,
  ].join("\n");

const normalWechatImage = [
  "Core article paragraph.",
  "",
  `![Campus activity](${wechatImage("body-image")})`,
  "",
  "A legitimate image caption remains part of the article.",
].join("\n");
assert.equal(
  normalize(normalWechatImage),
  normalWechatImage,
  "a normal mmbiz body image should be preserved",
);

const normalWechatLink = [
  "Core article paragraph with a natural citation.",
  "",
  `[Read the cited WeChat article](${wechatArticle("citation")})`,
].join("\n");
assert.equal(
  normalize(normalWechatLink),
  normalWechatLink,
  "a normal WeChat link without a recommendation image should be preserved",
);

const repeatedChineseRecommendations = [
  "这是文章的核心正文，必须完整保留。",
  "",
  recommendationCard("101", "当暑假有90天，西浦学生选择这样过！"),
  "",
  recommendationCard("102", "保安，流浪猫，和一部AI漫剧的诞生"),
].join("\n");
assert.equal(
  normalize(repeatedChineseRecommendations),
  "这是文章的核心正文，必须完整保留。",
  "a repeated Chinese WeChat recommendation-card suffix should be removed",
);

const repeatedEnglishRecommendations = [
  "This is the core article body and must remain intact.",
  "",
  recommendationCard("201", "How XJTLU students spent a 90-day summer"),
  "",
  recommendationCard("202", "A security guard, a stray cat and an AI animation"),
].join("\n");
assert.equal(
  normalize(repeatedEnglishRecommendations, {}, { translatedContent: true }),
  "This is the core article body and must remain intact.",
  "the same recommendation structure should be removed in English",
);

const creditsBeforeRecommendation = [
  "Core article body.",
  "",
  "记者：测试记者",
  "",
  "责编：测试编辑",
  "",
  recommendationCard("301", "另一篇推荐文章"),
].join("\n");
assert.equal(
  normalize(creditsBeforeRecommendation),
  ["Core article body.", "", "记者：测试记者", "", "责编：测试编辑"].join("\n"),
  "credits should remain while a following recommendation tail is removed",
);

const oneLinkedImageInBody = [
  "Opening body paragraph.",
  "",
  recommendationCard("401", "A naturally linked image inside the story"),
  "",
  "The article continues with substantive reporting after the linked image.",
  "",
  "Final article paragraph.",
].join("\n");
assert.equal(
  normalize(oneLinkedImageInBody),
  oneLinkedImageInBody,
  "one linked image in the middle of real body content should be preserved",
);

const singleLinkedImageAtEnd = [
  "Core article body.",
  "",
  recommendationCard("402", "A single linked image without footer evidence"),
].join("\n");
assert.equal(
  normalize(singleLinkedImageAtEnd),
  singleLinkedImageAtEnd,
  "one trailing linked image without a heading, credits, or repetition should be preserved",
);

const normalExternalLinks = [
  "Please complete the registration and survey.",
  "",
  "[Registration](https://events.example.com/register)",
  "",
  "[Survey](https://forms.example.com/survey)",
].join("\n");
assert.equal(
  normalize(normalExternalLinks),
  normalExternalLinks,
  "registration, survey, and external links should be preserved",
);

const recommendationHeadingTail = [
  "Core article body.",
  "",
  "## 推荐阅读",
  "",
  recommendationCard("501", "推荐文章标题"),
].join("\n");
assert.equal(
  normalize(recommendationHeadingTail),
  "Core article body.",
  "an explicit Chinese recommendation heading and its card should be removed",
);

const malformedEnglishTail = [
  "Core English article body.",
  "",
  "## READ MORE",
  "",
  "[",
  "",
  `![](${wechatImage("601")})`,
  `](${wechatArticle("601")})`,
  "",
  "A translated recommended article title",
].join("\n");
assert.equal(
  normalize(malformedEnglishTail, {}, { translatedContent: true }),
  "Core English article body.",
  "a malformed recommendation tail should be removed without stray delimiters",
);

assert.equal(formatArticlePublishedAt("2019-05-15T18:08:00"), "2019-05-15 18:08");
assert.equal(formatArticlePublishedAt("2019-05-15"), "2019-05-15");
assert.equal(formatArticlePublishedAt("unknown"), "unknown");

const chineseArticle = {
  id: "translated-article",
  title: "中文标题",
  author: "XJTLU",
  account: "西交利物浦大学",
  publishedAt: "2026-08-07T10:10:00",
  sourceUrl: "https://mp.weixin.qq.com/s/translated",
  digest: "中文摘要",
  digestSource: "frontmatter" as const,
  relativePath: "account/translated.md",
  content: "# 中文标题\n\n这是一篇中文文章，默认详情页必须继续显示中文原文。",
};
const englishTranslation = {
  version: 1 as const,
  articleId: chineseArticle.id,
  sourceLanguage: "zh",
  language: "en",
  title: "English title",
  digest: "English digest",
  content: "# English title\n\nEnglish body.",
  translatedAt: "2026-08-17T00:00:00.000Z",
  provider: "test",
  model: "test-v1",
};

const defaultLanguage = resolveArticleDetailLanguage(
  chineseArticle,
  englishTranslation,
  false,
);
assert.equal(defaultLanguage.displayArticle?.title, "中文标题");
assert.equal(defaultLanguage.displayArticle?.digest, "中文摘要");
assert.equal(defaultLanguage.englishAvailable, true);

const translatedLanguage = resolveArticleDetailLanguage(
  chineseArticle,
  englishTranslation,
  true,
);
assert.equal(translatedLanguage.displayArticle?.title, "English title");
assert.equal(translatedLanguage.displayArticle?.digest, "English digest");
assert.equal(translatedLanguage.displayArticle?.content, "# English title\n\nEnglish body.");
assert.equal(
  normalizeArticleMarkdownForDisplay({
    ...chineseArticle,
    title: "English title",
    content: [
      "# English title",
      "",
      "> XJTLU · Xi'an Jiaotong-Liverpool University · 2026-08-07 10:10",
      "",
      "> [Original Link](https://mp.weixin.qq.com/s/translated)",
      "",
      "English body.",
    ].join("\n"),
  }),
  "English body.",
  "translated title and source metadata should receive equivalent presentation normalization",
);

const missingLanguage = resolveArticleDetailLanguage(
  chineseArticle,
  undefined,
  true,
);
assert.equal(missingLanguage.englishAvailable, false);
assert.equal(missingLanguage.displayArticle, undefined);

const englishSource = {
  ...chineseArticle,
  id: "english-source",
  title: "An English source article",
  digest: "This digest belongs to the source article.",
  content: [
    "# An English source article",
    "",
    "This source article contains enough English prose for the existing deterministic language guard to classify it safely. It describes an international university event, the people who attended, the programme they followed, and the ideas they shared throughout the day.",
    "",
    "Participants discussed education, research, collaboration, community partnerships, future projects, student opportunities, and practical plans for the coming academic year. They also exchanged recommendations and agreed to continue working together across campuses and professional networks.",
  ].join("\n"),
};
const englishSourceLanguage = resolveArticleDetailLanguage(
  englishSource,
  undefined,
  true,
);
assert.equal(englishSourceLanguage.sourceIsEnglish, true);
assert.equal(englishSourceLanguage.englishAvailable, true);
assert.equal(englishSourceLanguage.displayArticle, englishSource);

console.log("Article presentation fixtures passed.");
