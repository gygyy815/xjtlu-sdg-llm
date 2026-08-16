import assert from "node:assert/strict";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import type { ArticleSummary } from "../lib/knowledge-base/types.ts";

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "m5-article-center-"));
const indexPath = path.join(temporaryRoot, "index.json");

function article(
  id: string,
  overrides: Partial<ArticleSummary> = {},
): ArticleSummary {
  return {
    id,
    title: `Article ${id}`,
    account: "XJTLU",
    digestSource: "frontmatter",
    relativePath: `${id}.md`,
    ...overrides,
  };
}

const fixture = [
  article("newest", {
    title: "人工智能新进展",
    digest: "A campus research update",
    publishedAt: "2025-06-03",
  }),
  article("middle", {
    title: "Library news",
    digest: "人工智能 resources",
    publishedAt: "2024-04-02T09:30:00+08:00",
  }),
  article("oldest", {
    account: "AI Research Centre",
    author: "Ada Lovelace",
    publishedAt: "2023-01-01",
  }),
  article("missing-date", { author: "Grace Hopper" }),
  article("bad-date", { publishedAt: "not-a-date" }),
  article("bad-calendar-date", { publishedAt: "2025-02-30" }),
];

try {
  await writeFile(indexPath, JSON.stringify(fixture), "utf8");
  process.env.KB_INDEX_PATH = indexPath;
  const { loadIndex, searchArticleSummaries } = await import(
    "../lib/knowledge-base/repository.ts"
  );

  const firstIndex = await loadIndex();
  assert.equal(await loadIndex(), firstIndex, "metadata index should be cached");

  const all = await searchArticleSummaries({ pageSize: 10 });
  assert.deepEqual(
    all.items.map(({ id }) => id),
    [
      "newest",
      "middle",
      "oldest",
      "bad-calendar-date",
      "bad-date",
      "missing-date",
    ],
    "dated articles should sort descending, followed by stable bad dates",
  );

  for (const [q, expectedId] of [
    ["人工智能", "newest"],
    ["campus research", "newest"],
    ["ai research centre", "oldest"],
    ["ADA LOVELACE", "oldest"],
  ] as const) {
    const result = await searchArticleSummaries({ q, pageSize: 10 });
    assert(
      result.items.some(({ id }) => id === expectedId),
      `query ${q} did not search the expected metadata field`,
    );
  }

  const firstPage = await searchArticleSummaries({ page: -4, pageSize: 2 });
  const secondPage = await searchArticleSummaries({ page: 2, pageSize: 2 });
  assert.equal(firstPage.page, 1, "pages below 1 should normalize to 1");
  assert.equal(firstPage.totalPages, 3);
  assert.notDeepEqual(firstPage.items, secondPage.items);

  const clamped = await searchArticleSummaries({ page: 99, pageSize: 2 });
  assert.equal(clamped.page, 3, "pages above the result range should clamp");
  assert.equal(clamped.items.length, 2);

  const empty = await searchArticleSummaries({ q: "no such metadata" });
  assert.equal(empty.total, 0);
  assert.equal(empty.page, 1);
  assert.equal(empty.totalPages, 0);

  console.log("M5-A article repository list/search tests passed.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
