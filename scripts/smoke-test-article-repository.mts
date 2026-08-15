import assert from "node:assert/strict";
import {
  getArticleById,
  getArticleSummaryById,
  loadIndex,
} from "../lib/knowledge-base/repository.ts";

const articleId = process.argv[2] || process.env.ARTICLE_ID;
if (!articleId) {
  console.error(
    "Usage: npm run smoke:article-repository -- <real-article-id>",
  );
  process.exit(1);
}

const index = await loadIndex();
assert.equal(await loadIndex(), index, "loadIndex did not reuse its cached result");
assert.equal(
  await getArticleSummaryById("__missing_article_smoke_test__"),
  undefined,
);
const summary = await getArticleSummaryById(articleId);
assert(summary, `Article ${articleId} was not found in the index`);
assert.equal(summary.id, articleId);

const article = await getArticleById(articleId);
assert(article, `Article ${articleId} could not be loaded`);
assert.equal(article.id, summary.id);
assert.equal(article.title, summary.title);
assert(article.content.length > 0, `Article ${articleId} has an empty body`);

console.log(
  JSON.stringify(
    {
      indexedArticles: index.size,
      id: article.id,
      title: article.title,
      contentLength: article.content.length,
    },
    null,
    2,
  ),
);
