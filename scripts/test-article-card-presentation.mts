import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  articleCardSourceHash,
  FileSystemArticleCardTranslationRepository,
  resolveArticleCard,
  resolveArticleCards,
} from "../lib/article-card-presentation.ts";
import type { ArticleSummary } from "../lib/knowledge-base/types.ts";
import type { TranslationRecordV2 } from "../lib/translation/types.ts";

const root = await mkdtemp(path.join(os.tmpdir(), "article-card-cache-"));
const repository = new FileSystemArticleCardTranslationRepository(root);
const article: ArticleSummary = {
  id: "card-fixture",
  title: "2026 校园招聘通知",
  account: "XJTLU",
  summary: "面向应届毕业生的校园招聘活动。",
  digestSource: "frontmatter",
  relativePath: "card-fixture.md",
  publishedAt: "2026-08-01",
};
const full: TranslationRecordV2 = {
  version: 2,
  articleId: article.id,
  sourceHash: "a".repeat(64),
  sourceLanguage: "zh",
  language: "en",
  title: "2026 Campus Recruitment Notice",
  summary: "A campus recruitment event for graduating students.",
  content: "A campus recruitment event for graduating students.",
  translatedAt: new Date().toISOString(),
  provider: "fixture",
  model: "fixture",
};

let fullLoads = 0;
const fromFull = await resolveArticleCard(article, "en", {
  cardRepository: repository,
  loadFullTranslation: async () => { fullLoads += 1; return full; },
});
assert.equal(fromFull.translationSource, "full-cache");
assert.equal(fromFull.displayTitle, full.title);
assert.equal(fromFull.displaySummary, full.summary);
assert.equal(fullLoads, 1);

await repository.save({
  version: 1,
  articleId: article.id,
  sourceHash: articleCardSourceHash(article),
  language: "en",
  title: "2026 Campus Recruitment Notice (card)",
  summary: "A card-only summary.",
  translatedAt: new Date().toISOString(),
  provider: "fixture-card",
  model: "fixture",
  processingVersion: "article-card-v1",
});
const fromCard = await resolveArticleCard(article, "en", { cardRepository: repository, loadFullTranslation: async () => undefined });
assert.equal(fromCard.translationSource, "card-cache");
assert.equal(fromCard.displayTitle, "2026 Campus Recruitment Notice (card)");
assert.equal(fromCard.displaySummary, "A card-only summary.");

const source = await resolveArticleCard(article, "en", { cardRepository: repository, loadFullTranslation: async () => undefined });
assert.equal(source.translationSource, "card-cache");
const staleArticle = { ...article, title: "2027 校园招聘通知" };
const stale = await resolveArticleCard(staleArticle, "en", { cardRepository: repository, loadFullTranslation: async () => undefined });
assert.equal(stale.translationSource, "source-fallback");
assert.equal(stale.displayTitle, staleArticle.title);
assert.equal(stale.displaySummary, staleArticle.summary);

const zh = await resolveArticleCard(article, "zh", { cardRepository: repository, loadFullTranslation: async () => { throw new Error("provider must not be called"); } });
assert.equal(zh.translationSource, "source");
assert.equal(zh.displayTitle, article.title);

const multiple = await resolveArticleCards([article, staleArticle], "en", { cardRepository: repository, loadFullTranslation: async () => undefined });
assert.equal(multiple.length, 2);
assert.equal(multiple[0].readLabel, "Read article →");
assert.equal(multiple[1].footerText, "XJTLU");

console.log(`Article card presentation fixtures passed (${root}).`);
