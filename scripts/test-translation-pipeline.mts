import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtemp, mkdir, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { assertMarkdownUrlsPreserved } from "../lib/translation/service.ts";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const temporaryRoot = await mkdtemp(
  path.join(tmpdir(), "xjtlu-translation-pipeline-"),
);
const markdownRoot = path.join(temporaryRoot, "markdown");
const enrichmentRoot = path.join(temporaryRoot, "enrichment");
const indexPath = path.join(temporaryRoot, "full-kb-index.json");
const articleRelativePath = "account/recent.md";
const articlePath = path.join(markdownRoot, articleRelativePath);
const articleBody = [
  "# 近期活动",
  "",
  "**日期：** 8月20日",
  "",
  "[报名链接](https://example.com/register?a=1&b=2)",
  "",
  "![](https://images.example.com/poster.png)",
].join("\n");
const articleSource = [
  "---",
  "title: 近期活动",
  "---",
  articleBody,
  "",
].join("\n");

const baseSummary = {
  author: "Test Author",
  account: "Test Account",
  sourceUrl: "https://mp.weixin.qq.com/s/test",
  digestSource: "frontmatter",
};
const index = [
  {
    ...baseSummary,
    id: "recent-article",
    title: "近期活动",
    publishedAt: "2026-08-15T10:00:00",
    digest: "近期活动摘要",
    relativePath: articleRelativePath,
  },
  {
    ...baseSummary,
    id: "second-recent",
    title: "第二篇近期文章",
    publishedAt: "2026-08-10",
    relativePath: "account/second.md",
  },
  {
    ...baseSummary,
    id: "old-article",
    title: "旧文章",
    publishedAt: "2025-01-01",
    relativePath: "account/old.md",
  },
];

function runBatch(extraArguments: string[] = []) {
  return execFileSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--experimental-strip-types",
      "scripts/translate-articles.mts",
      "--since",
      "2026-08-01",
      "--limit",
      "1",
      ...extraArguments,
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        KB_MARKDOWN_ROOT: markdownRoot,
        KB_INDEX_PATH: indexPath,
        KB_ENRICHMENT_ROOT: enrichmentRoot,
      },
    },
  );
}

async function reports() {
  const reportDirectory = path.join(
    enrichmentRoot,
    "reports",
    "translations",
  );
  const names = (await readdir(reportDirectory)).sort();
  return Promise.all(
    names.map(async (name) =>
      JSON.parse(await readFile(path.join(reportDirectory, name), "utf8")),
    ),
  );
}

try {
  await mkdir(path.dirname(articlePath), { recursive: true });
  await writeFile(articlePath, articleSource, "utf8");
  await writeFile(
    path.join(markdownRoot, "account/second.md"),
    "Second recent article",
    "utf8",
  );
  await writeFile(
    path.join(markdownRoot, "account/old.md"),
    "Old article",
    "utf8",
  );
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

  const firstOutput = runBatch();
  assert.match(firstOutput, /translated: 1; skipped existing: 0; failed: 0/);
  const translationPath = path.join(
    enrichmentRoot,
    "translations/en/recent-article.json",
  );
  const firstTranslation = JSON.parse(await readFile(translationPath, "utf8"));
  assert.equal(firstTranslation.version, 1);
  assert.equal(firstTranslation.provider, "mock");
  assert.equal(firstTranslation.model, "identity-v1");
  assert.equal(firstTranslation.content, articleBody);
  assert.equal(await readFile(articlePath, "utf8"), articleSource);
  assert.equal((await reports())[0].selection.matched, 2);
  assert.equal((await reports())[0].selection.selected, 1);

  firstTranslation.content = "SKIP-SENTINEL";
  await writeFile(
    translationPath,
    `${JSON.stringify(firstTranslation, null, 2)}\n`,
    "utf8",
  );
  const skippedOutput = runBatch();
  assert.match(skippedOutput, /translated: 0; skipped existing: 1; failed: 0/);
  assert.equal(
    JSON.parse(await readFile(translationPath, "utf8")).content,
    "SKIP-SENTINEL",
  );

  const forcedOutput = runBatch(["--force"]);
  assert.match(forcedOutput, /translated: 1; skipped existing: 0; failed: 0/);
  assert.equal(
    JSON.parse(await readFile(translationPath, "utf8")).content,
    articleBody,
  );
  const allReports = await reports();
  assert.equal(allReports.length, 3);
  assert.equal(
    allReports.filter((report) => report.selection.force).length,
    1,
  );

  assert.doesNotThrow(() =>
    assertMarkdownUrlsPreserved(articleBody, articleBody),
  );
  assert.throws(
    () =>
      assertMarkdownUrlsPreserved(
        articleBody,
        articleBody.replace("poster.png", "changed.png"),
      ),
    /changed the Markdown URL sequence/,
  );

  console.log(
    "Translation pipeline fixtures passed: selection, storage, report, skip, force, source immutability, and URL validation.",
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
