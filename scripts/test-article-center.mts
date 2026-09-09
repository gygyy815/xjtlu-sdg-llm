import assert from "node:assert/strict";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import {
  articleCenterHref,
  ARTICLE_YEARS,
  articleTimeRangeBounds,
  ARTICLE_TIME_RANGES,
  firstSearchParam,
  parseArticleCenterPage,
  resolveArticleSortParam,
  resolveArticleYearParams,
  resolveArticleTimeRangeParam,
  resolveKnowledgeDomainParam,
  resolveSdgGoalParam,
} from "../lib/article-center-query.ts";
import {
  formatSdgCode,
  SDG_GOALS,
  visibleArticleSdgTags,
} from "../lib/knowledge-base/sdg-goals.ts";
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
    summary: "An SDG-enriched campus research summary",
    sdgTags: [
      {
        code: "SDG8.6",
        level: "target",
        tag: "8.6-青年就业",
        url: "https://sdgs.un.org/goals/goal8",
        reason: "面向应届毕业生招聘",
      },
      {
        code: "SDG4.4",
        level: "target",
        tag: "4.4-就业技能",
        url: "https://sdgs.un.org/goals/goal4",
      },
    ],
    account: "西浦AI学院 AOA",
    publishedAt: "2025-06-03",
  }),
  article("middle", {
    title: "Library news",
    digest: "人工智能 resources",
    account: "西浦就业CareerCentre",
    publishedAt: "2025-04-02T09:30:00+08:00",
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
  article("bad-date", {
    publishedAt: "not-a-date",
    sdgTags: [
      null,
      { code: "SDG1", tag: "missing URL" },
      { code: "SDG2", tag: "wrong host", url: "https://example.com/goal2" },
      {
        code: "SDG3.4",
        tag: "3.4-健康与福祉",
        url: "https://sdgs.un.org/goals/goal3",
      },
    ] as never,
  }),
  article("bad-calendar-date", { publishedAt: "2025-02-30" }),
];

Object.assign(fixture[0], {
  _sdg_source_sha256: "pipeline-only",
  _sdg_processed_at: "2026-08-28T00:00:00Z",
  _sdg_ocr: { used: true },
});

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
  const enriched = await getArticleSummaryById("newest");
  assert.equal(enriched?.summary, "An SDG-enriched campus research summary");
  assert.equal(enriched?.sdgTags?.length, 2);
  assert.equal(
    enriched?.sdgTags?.[0]?.url,
    "https://sdgs.un.org/goals/goal8",
    "official UN URLs should be preserved",
  );
  assert.equal("_sdg_source_sha256" in (enriched ?? {}), false);
  assert.equal("_sdg_processed_at" in (enriched ?? {}), false);
  assert.equal("_sdg_ocr" in (enriched ?? {}), false);
  assert.equal(
    (await getArticleSummaryById("middle"))?.sdgTags,
    undefined,
    "old entries without SDG metadata should load normally",
  );
  assert.deepEqual(
    (await getArticleSummaryById("bad-date"))?.sdgTags,
    [
      {
        code: "SDG3.4",
        tag: "3.4-健康与福祉",
        url: "https://sdgs.un.org/goals/goal3",
      },
    ],
    "malformed SDG tags should be skipped without rejecting the article",
  );
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
    ["SDG-enriched", "newest"],
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

  const bySourceAccount = await searchArticleSummaries({
    sourceAccount: "西浦AI学院 AOA",
    pageSize: 10,
  });
  assert.deepEqual(
    bySourceAccount.items.map(({ id }) => id),
    ["newest"],
    "source filter should match the exact public-account name",
  );

  const byContentType = await searchArticleSummaries({
    contentType: "notice",
  });
  assert.deepEqual(byContentType.items.map(({ id }) => id), ["middle"]);

  const bySdgGoal = await searchArticleSummaries({
    sdgGoal: "8",
    pageSize: 10,
  });
  assert.deepEqual(
    bySdgGoal.items.map(({ id }) => id),
    ["newest"],
    "SDG goal 8 should match a target code such as SDG8.6",
  );
  assert.equal(
    bySdgGoal.items.some(({ id }) => id === "middle"),
    false,
    "articles without SDG tags should not match an SDG goal filter",
  );

  const byPublicationYears = await searchArticleSummaries({
    publicationYears: ["2025"],
    pageSize: 10,
  });
  assert.deepEqual(
    byPublicationYears.items.map(({ id }) => id),
    ["newest", "middle"],
    "year filter should match the publication year",
  );
  const byMultiplePublicationYears = await searchArticleSummaries({
    publicationYears: ["2023", "2025"],
    pageSize: 10,
  });
  assert.deepEqual(
    byMultiplePublicationYears.items.map(({ id }) => id),
    ["newest", "middle", "oldest"],
    "year filter should support selecting multiple years",
  );

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

  const fixedNow = "2025-06-30T12:00:00+08:00";
  assert.deepEqual(articleTimeRangeBounds("30d", new Date(fixedNow)), {
    publishedAfter: "2025-05-31",
    publishedBefore: "2025-06-30",
  });
  assert.deepEqual(articleTimeRangeBounds("3m", new Date(fixedNow)), {
    publishedAfter: "2025-03-30",
    publishedBefore: "2025-06-30",
  });
  assert.deepEqual(articleTimeRangeBounds("6m", new Date(fixedNow)), {
    publishedAfter: "2024-12-30",
    publishedBefore: "2025-06-30",
  });
  assert.deepEqual(articleTimeRangeBounds("1y", new Date(fixedNow)), {
    publishedAfter: "2024-06-30",
    publishedBefore: "2025-06-30",
  });
  assert.deepEqual(articleTimeRangeBounds("2025", new Date(fixedNow)), {
    publishedAfter: "2025-01-01",
    publishedBefore: "2025-12-31",
  });
  assert.deepEqual(ARTICLE_TIME_RANGES, [
    "all",
    "30d",
    "3m",
    "6m",
    "1y",
    "2026",
    "2025",
    "2024",
    "2023",
    "2022",
    "2021",
    "2020",
    "2019",
    "2018",
    "2017",
    "2016",
    "2015",
    "2014",
  ]);
  assert.equal(resolveArticleTimeRangeParam("3m"), "3m");
  assert.equal(resolveArticleTimeRangeParam("unsupported"), "all");
  assert.equal(resolveArticleSortParam("oldest"), "oldest");
  assert.equal(resolveArticleSortParam("unsupported"), "newest");

  const newestSort = await searchArticleSummaries({ sort: "newest", pageSize: 10, now: fixedNow });
  assert.deepEqual(newestSort.items.map(({ id }) => id), ["newest", "middle", "oldest", "bad-calendar-date", "bad-date", "missing-date"]);
  const oldestSort = await searchArticleSummaries({ sort: "oldest", pageSize: 10, now: fixedNow });
  assert.deepEqual(oldestSort.items.map(({ id }) => id), ["oldest", "middle", "newest", "bad-calendar-date", "bad-date", "missing-date"]);
  for (const [timeRange, expected] of [
    ["30d", ["newest"]],
    ["3m", ["newest", "middle"]],
    ["6m", ["newest", "middle"]],
    ["1y", ["newest", "middle"]],
    ["2026", []],
    ["2025", ["newest", "middle"]],
    ["2024", []],
    ["2023", ["oldest"]],
    ["2022", []],
    ["2021", []],
    ["2020", []],
    ["2019", []],
    ["2018", []],
    ["2017", []],
    ["2016", []],
    ["2015", []],
    ["2014", []],
  ] as const) {
    const result = await searchArticleSummaries({ timeRange: timeRange as never, pageSize: 10, now: fixedNow });
    assert.deepEqual(result.items.map(({ id }) => id), expected, `${timeRange} filter mismatch`);
  }
  const temporalPage = await searchArticleSummaries({ timeRange: "3m", sort: "oldest", page: 2, pageSize: 1, now: fixedNow });
  assert.equal(temporalPage.total, 2);
  assert.deepEqual(temporalPage.items.map(({ id }) => id), ["newest"]);

  assert(
    all.items.some(({ id }) => id === "missing-date"),
    "unclassified articles should remain visible without filters",
  );
  assert(
    !byKnowledgeDomain.items.some(({ id }) => id === "missing-date"),
    "unclassified articles should be excluded by a specific filter",
  );

  const paginationHref = articleCenterHref({
    language: "en",
    q: "人工智能",
    knowledgeDomain: "careers-opportunities",
    organizationUnit: "ai-academy",
    contentType: "activity",
    sdgGoal: "8",
    years: ["2026", "2025"],
    timeRange: "1y",
    sort: "oldest",
    page: 2,
  });
  const paginationUrl = new URL(paginationHref, "https://example.test");
  assert.equal(paginationUrl.searchParams.get("lang"), "en");
  assert.equal(paginationUrl.searchParams.get("q"), "人工智能");
  assert.equal(
    paginationUrl.searchParams.get("domain"),
    "careers-opportunities",
  );
  assert.equal(paginationUrl.searchParams.get("org"), "ai-academy");
  assert.equal(paginationUrl.searchParams.has("kb"), false);
  assert.equal(paginationUrl.searchParams.get("type"), "activity");
  assert.equal(paginationUrl.searchParams.get("sdg"), "8");
  assert.equal(paginationUrl.searchParams.get("year"), "2026,2025");
  assert.equal(paginationUrl.searchParams.get("time"), "1y");
  assert.equal(paginationUrl.searchParams.get("sort"), "oldest");
  assert.equal(paginationUrl.searchParams.get("page"), "2");
  assert.equal(
    new URL(
      articleCenterHref({
        q: "人工智能",
        knowledgeDomain: "careers-opportunities",
        organizationUnit: "ai-academy",
        contentType: "activity",
        sdgGoal: "8",
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
  assert.equal(resolveSdgGoalParam("SDG 8"), "8");
  assert.equal(resolveSdgGoalParam(["17", "8"]), "17");
  assert.equal(resolveSdgGoalParam("18"), "");
  assert.deepEqual(resolveArticleYearParams(["2026,2025", "2025", "2013"]), ["2026", "2025"]);
  assert.deepEqual(resolveArticleYearParams("2020,2019"), ["2020", "2019"]);
  assert.equal(ARTICLE_YEARS.length, 13);
  assert.equal(SDG_GOALS.length, 17, "V1 should expose exactly 17 SDG goals");

  const fourSdgTags = [
    { code: "SDG8.6", tag: "one", url: "https://sdgs.un.org/goals/goal8" },
    { code: "SDG4.4", tag: "two", url: "https://sdgs.un.org/goals/goal4" },
    { code: "SDG3", tag: "three", url: "https://sdgs.un.org/goals/goal3" },
    { code: "SDG17", tag: "four", url: "https://sdgs.un.org/goals/goal17" },
  ];
  assert.deepEqual(
    visibleArticleSdgTags(fourSdgTags).map(({ code }) => formatSdgCode(code)),
    ["SDG 8.6", "SDG 4.4", "SDG 3"],
    "article cards should render no more than three compact SDG badges",
  );

  const articlesPageSource = await readFile(
    path.join(process.cwd(), "app/articles/page.tsx"),
    "utf8",
  );
  assert.match(articlesPageSource, /name="year"/);
  assert.match(articlesPageSource, /className="yearFilter"/);
  assert.doesNotMatch(articlesPageSource, /name="sort"/);
  assert.match(
    articlesPageSource,
    /<Link className="articleCard" href=\{`\/articles\/\$\{article\.id\}\$\{english \? "\?lang=en" : ""\}`\}/,
    "the complete article card should be the navigation link",
  );
  assert.equal(
    articlesPageSource.split('href={`/articles/${article.id}${english ? "?lang=en" : ""}`}').length - 1,
    1,
    "the card must not contain a second nested article-detail link",
  );

  const articleDetailSource = await readFile(
    path.join(process.cwd(), "app/articles/[id]/page.tsx"),
    "utf8",
  );
  assert.match(
    articleDetailSource,
    /<Link className="browseKnowledgeButton" href=\{articleCenterHref\}>\{englishInterface \? "← Browse Knowledge Base" : "← 浏览知识库"\}<\/Link>/,
    "article details should expose a clear button back to the Article Center list",
  );
  const sourceActionPosition = articleDetailSource.indexOf(
    'className="articleSourceAction"',
  );
  const sdgSectionPosition = articleDetailSource.indexOf(
    'className="articleSdgReferences"',
  );
  const articleBodyPosition = articleDetailSource.indexOf(
    'className="articleBody articleMarkdown"',
  );
  assert(
    sourceActionPosition > 0 &&
      sourceActionPosition < sdgSectionPosition &&
      sourceActionPosition < articleBodyPosition,
    "the original-source action should appear above SDG references and article body",
  );
  assert.match(
    articleDetailSource,
    /<a className="articleSdgReference" href=\{sdgTag\.url\}/,
    "each SDG reference card should itself link to its official URL",
  );
  assert.match(
    articleDetailSource,
    /: <Link href=\{englishHref\} className="pending" aria-label="Generate English translation">English<\/Link>/,
    "missing English translations should remain reachable so the lazy generator can start",
  );
  assert.doesNotMatch(
    articleDetailSource,
    /<article className="articleSdgReference"/,
    "SDG reference cards should not contain a nested standalone link",
  );
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

  console.log("Article Center repository/filter/UX tests passed.");
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
