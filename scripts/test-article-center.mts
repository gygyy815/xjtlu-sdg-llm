import assert from "node:assert/strict";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  articleCenterHref,
  firstSearchParam,
  parseArticleCenterPage,
  resolveKnowledgeDomainParam,
} from "../lib/article-center-query.ts";
import type { ArticleSummary } from "../lib/knowledge-base/types.ts";

const temporaryRoot = await mkdtemp(path.join(os.tmpdir(), "m5-article-center-"));
const indexPath = path.join(temporaryRoot, "index.json");
const enrichmentRoot = path.join(temporaryRoot, "enrichment");

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
    account: "西浦AI学院 AOA",
    publishedAt: "2025-06-03",
  }),
  article("middle", {
    title: "Library news",
    digest: "人工智能 resources",
    account: "西浦就业CareerCentre",
    publishedAt: "2024-04-02T09:30:00+08:00",
  }),
  article("oldest", {
    account: "西交利物浦大学校友会",
    author: "Ada Lovelace",
    publishedAt: "2023-01-01",
  }),
  article("missing-date", {
    author: "Grace Hopper",
    account: "未知机构",
    organizationUnit: "career-centre",
    primaryDomain: "careers-opportunities",
    secondaryDomains: [],
    contentType: "raw-metadata" as never,
  }),
  article("bad-date", { publishedAt: "not-a-date" }),
  article("bad-calendar-date", { publishedAt: "2025-02-30" }),
];

function productionClassification({
  organization = [],
  knowledgeDomains = [],
  contentTypes = [],
}: {
  organization?: string[];
  knowledgeDomains?: string[];
  contentTypes?: string[];
}) {
  return {
    organization,
    knowledgeDomains,
    contentTypes,
    confidence: {
      organization: organization.length > 0 ? "high" : "low",
      domain: knowledgeDomains.length > 0 ? "high" : "low",
      contentType: contentTypes.length > 0 ? "medium" : "low",
    },
    classification: { method: "rule", version: "v3" },
  };
}

try {
  await writeFile(indexPath, JSON.stringify(fixture), "utf8");
  await mkdir(path.join(enrichmentRoot, "classification"), { recursive: true });
  await writeFile(
    path.join(enrichmentRoot, "classification", "index.json"),
    JSON.stringify({
      version: 1,
      generatedAt: "2026-08-24T00:00:00.000Z",
      classifierVersion: "taxonomy-v3-semantic-templates",
      articles: {
        newest: productionClassification({
          organization: ["Academy of Artificial Intelligence"],
          knowledgeDomains: [
            "Schools & Research",
            "Careers & Opportunities",
          ],
          contentTypes: ["activity"],
        }),
        middle: productionClassification({
          organization: ["Career Centre"],
          knowledgeDomains: ["Careers & Opportunities"],
          contentTypes: ["notice"],
        }),
        oldest: productionClassification({
          organization: ["Alumni Association"],
          knowledgeDomains: ["Alumni & Community"],
          contentTypes: ["opportunity"],
        }),
        "bad-date": productionClassification({
          knowledgeDomains: [
            "Schools & Research",
            "Careers & Opportunities",
          ],
          contentTypes: ["activity"],
        }),
      },
    }),
    "utf8",
  );
  process.env.KB_INDEX_PATH = indexPath;
  process.env.KB_ENRICHMENT_ROOT = enrichmentRoot;
  const { getArticleSummaryById, loadIndex, searchArticleSummaries } = await import(
    "../lib/knowledge-base/repository.ts"
  );

  const firstIndex = await loadIndex();
  assert.equal(await loadIndex(), firstIndex, "metadata index should be cached");
  assert.equal(
    (await getArticleSummaryById("newest"))?.organizationUnit,
    "ai-academy",
  );
  assert.equal(
    (await getArticleSummaryById("newest"))?.primaryDomain,
    "schools-research",
  );
  assert.deepEqual((await getArticleSummaryById("newest"))?.secondaryDomains, [
    "careers-opportunities",
  ]);
  assert.equal((await getArticleSummaryById("newest"))?.contentType, "activity");
  assert.equal(
    (await getArticleSummaryById("missing-date"))?.primaryDomain,
    undefined,
    "organisation metadata embedded in the raw index must not be trusted",
  );
  assert.equal(
    (await getArticleSummaryById("missing-date"))?.organizationUnit,
    undefined,
  );

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
    ["西交利物浦大学校友会", "oldest"],
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

  const byKnowledgeDomain = await searchArticleSummaries({
    knowledgeDomain: "careers-opportunities",
    pageSize: 10,
  });
  assert.deepEqual(
    byKnowledgeDomain.items.map(({ id }) => id),
    ["newest", "middle", "bad-date"],
  );

  const byMultiMembership = await searchArticleSummaries({
    knowledgeDomain: "schools-research",
  });
  assert.deepEqual(byMultiMembership.items.map(({ id }) => id), [
    "newest",
    "bad-date",
  ]);

  const byOrganization = await searchArticleSummaries({
    organizationUnit: "ai-academy",
    pageSize: 10,
  });
  assert.deepEqual(byOrganization.items.map(({ id }) => id), [
    "newest",
  ]);

  const byContentType = await searchArticleSummaries({
    contentType: "notice",
  });
  assert.deepEqual(byContentType.items.map(({ id }) => id), ["middle"]);

  const byQueryAndKnowledgeDomain = await searchArticleSummaries({
    q: "人工智能",
    knowledgeDomain: "careers-opportunities",
  });
  assert.deepEqual(
    byQueryAndKnowledgeDomain.items.map(({ id }) => id),
    ["newest", "middle"],
  );

  const byKnowledgeDomainAndType = await searchArticleSummaries({
    knowledgeDomain: "careers-opportunities",
    contentType: "activity",
  });
  assert.deepEqual(
    byKnowledgeDomainAndType.items.map(({ id }) => id),
    ["newest", "bad-date"],
  );

  const byAllFilters = await searchArticleSummaries({
    q: "人工智能",
    knowledgeDomain: "careers-opportunities",
    organizationUnit: "ai-academy",
    contentType: "activity",
  });
  assert.deepEqual(byAllFilters.items.map(({ id }) => id), ["newest"]);

  const filteredPage = await searchArticleSummaries({
    knowledgeDomain: "careers-opportunities",
    page: 2,
    pageSize: 2,
  });
  assert.equal(filteredPage.total, 3);
  assert.equal(filteredPage.totalPages, 2);
  assert.equal(filteredPage.page, 2);
  assert.deepEqual(filteredPage.items.map(({ id }) => id), ["bad-date"]);

  assert(
    all.items.some(({ id }) => id === "missing-date"),
    "unclassified articles should remain visible without filters",
  );
  assert(
    !byKnowledgeDomain.items.some(({ id }) => id === "missing-date"),
    "unclassified articles should be excluded by a specific filter",
  );

  const paginationHref = articleCenterHref({
    q: "人工智能",
    knowledgeDomain: "careers-opportunities",
    organizationUnit: "ai-academy",
    contentType: "activity",
    page: 2,
  });
  const paginationUrl = new URL(paginationHref, "https://example.test");
  assert.equal(paginationUrl.searchParams.get("q"), "人工智能");
  assert.equal(
    paginationUrl.searchParams.get("domain"),
    "careers-opportunities",
  );
  assert.equal(paginationUrl.searchParams.get("org"), "ai-academy");
  assert.equal(paginationUrl.searchParams.has("kb"), false);
  assert.equal(paginationUrl.searchParams.get("type"), "activity");
  assert.equal(paginationUrl.searchParams.get("page"), "2");
  assert.equal(
    new URL(
      articleCenterHref({
        q: "人工智能",
        knowledgeDomain: "careers-opportunities",
        organizationUnit: "ai-academy",
        contentType: "activity",
      }),
      "https://example.test",
    ).searchParams.has("page"),
    false,
    "a new search/filter submission should reset pagination",
  );
  assert.equal(parseArticleCenterPage("0"), 1);
  assert.equal(parseArticleCenterPage("-1"), 1);
  assert.equal(parseArticleCenterPage("not-a-page"), 1);
  assert.equal(parseArticleCenterPage("2"), 2);
  assert.equal(firstSearchParam(["first", "second"]), "first");
  assert.equal(
    resolveKnowledgeDomainParam("schools-research", "legacy-value"),
    "schools-research",
    "the canonical domain parameter should take precedence",
  );
  assert.equal(
    resolveKnowledgeDomainParam(undefined, "careers-opportunities"),
    "careers-opportunities",
    "the legacy kb parameter should remain a temporary input alias",
  );

  console.log("M6-A Article Center repository/filter tests passed.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
