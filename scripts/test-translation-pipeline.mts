import assert from "node:assert/strict";
import { execFileSync, spawnSync } from "node:child_process";
import {
  access,
  mkdtemp,
  mkdir,
  readFile,
  readdir,
  rm,
  writeFile,
} from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { fileURLToPath } from "node:url";
import {
  assertMarkdownUrlsPreserved,
  planMarkdownTranslation,
} from "../lib/translation/markdown.ts";
import {
  detectMarkdownLanguage,
  extractVisibleMarkdownText,
} from "../lib/translation/language.ts";
import {
  createTranslationProviderFromEnvironment,
  OpenAICompatibleTranslationProvider,
  parseOpenAICompatibleResponse,
  type TranslationProvider,
} from "../lib/translation/provider.ts";
import { FileSystemTranslationRepository } from "../lib/translation/repository.ts";
import { TranslationService } from "../lib/translation/service.ts";
import { TRANSLATION_GLOSSARY } from "../lib/translation/terminology.ts";
import {
  assertMarkdownStructurePreserved,
  detectSuspiciousChineseResidue,
} from "../lib/translation/validation.ts";

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
const clearlyEnglishBody = [
  "# XJTLU’s 20th anniversary alumni cruise lights up Sydney Harbour",
  "",
  "> 原创 · XJTLU · 西交利物浦大学 · 2026-08-08 11:57",
  "",
  "> [原文链接](https://mp.weixin.qq.com/s/example)",
  "",
  "On 6 August, more than 100 Xi’an Jiaotong-Liverpool University alumni gathered at King Street Wharf for a cruise on Sydney Harbour. This marked the first Southern Hemisphere stop in the Next Together series of events for the University’s anniversary.",
  "",
  "Following group check-in and boarding, alumni embarked on a two-and-a-half-hour cruise. They enjoyed dinner against the backdrop of the Opera House and Harbour Bridge while reconnecting with classmates and meeting graduates from other cohorts.",
  "",
  "The formal programme opened with an update on the growth of the Sydney alumni association, followed by a keynote address about the University’s development and its international community. Guests then shared memories and plans for future collaboration.",
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
  {
    ...baseSummary,
    id: "single-article",
    title: "单篇调试文章",
    digest: "这是一篇用于验证单篇模式的中文文章摘要。",
    relativePath: "account/single.md",
  },
  {
    ...baseSummary,
    id: "english-article",
    title: "English article",
    relativePath: "account/english.md",
  },
];

function runCli(
  arguments_: string[],
  outputRoot = enrichmentRoot,
) {
  return execFileSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--experimental-strip-types",
      "scripts/translate-articles.mts",
      ...arguments_,
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        KB_MARKDOWN_ROOT: markdownRoot,
        KB_INDEX_PATH: indexPath,
        KB_ENRICHMENT_ROOT: outputRoot,
        TRANSLATION_PROVIDER: "mock",
      },
    },
  );
}

function runBatch(extraArguments: string[] = []) {
  return runCli([
    "--since",
    "2026-08-01",
    "--limit",
    "1",
    ...extraArguments,
  ]);
}

async function reports(outputRoot = enrichmentRoot) {
  const reportDirectory = path.join(
    outputRoot,
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
  await writeFile(
    path.join(markdownRoot, "account/single.md"),
    [
      "# 单篇调试文章",
      "",
      "这是一篇明确的中文文章，用于验证通过文章编号直接读取和翻译。",
      "",
      "正文包含足够的中文信息，并且不依赖发布日期筛选。",
    ].join("\n"),
    "utf8",
  );
  await writeFile(
    path.join(markdownRoot, "account/english.md"),
    clearlyEnglishBody,
    "utf8",
  );
  await writeFile(indexPath, `${JSON.stringify(index, null, 2)}\n`, "utf8");

  const readOnlyRepositoryRoot = path.join(temporaryRoot, "read-only-enrichment");
  const readOnlyRepository = new FileSystemTranslationRepository(
    readOnlyRepositoryRoot,
  );
  assert.equal(
    await readOnlyRepository.getEnglishTranslationByArticleId("not-generated"),
    undefined,
    "a missing English enrichment should be a normal cache miss",
  );
  const malformedTranslationPath = readOnlyRepository.translationPath(
    "malformed-article",
    "en",
  );
  await mkdir(path.dirname(malformedTranslationPath), { recursive: true });
  await writeFile(malformedTranslationPath, "{ broken JSON", "utf8");
  await assert.rejects(
    () =>
      readOnlyRepository.getEnglishTranslationByArticleId(
        "malformed-article",
      ),
    /Could not read translation/,
    "a malformed English enrichment must remain an explicit server error",
  );

  const clearlyChinese = [
    "# 校园近期活动通知",
    "",
    "本次活动面向全校师生开放，欢迎大家报名参加并关注后续安排。",
    "我们将在现场提供详细说明，也会及时发布最新消息和注意事项。",
  ].join("\n");
  assert.equal(
    detectMarkdownLanguage(clearlyChinese).classification,
    "clearly_zh",
  );
  assert.equal(
    detectMarkdownLanguage(clearlyEnglishBody).classification,
    "clearly_en",
  );

  const mixedBody = [
    "这是一段中英混合的正文，包含中文背景、项目目标、参与方式和后续安排。",
    "The programme brings students, researchers, alumni, and community partners together to discuss sustainability, education, culture, innovation, collaboration, and practical opportunities across several international campuses and professional networks.",
    "中文部分仍然表达重要信息，不能因为英文段落较长就跳过整篇文章。",
    "Participants will also review current projects, exchange detailed recommendations, identify shared priorities, and prepare a practical roadmap for future events, publications, workshops, partnerships, and student-led activities during the coming academic year.",
  ].join("\n\n");
  assert.equal(
    detectMarkdownLanguage(mixedBody).classification,
    "ambiguous",
  );

  const chineseWithNonProseEnglish = [
    "# 中文文章",
    "",
    "这是一篇内容明确的中文文章，介绍校园活动的时间、地点、报名方式和注意事项。",
    "请大家阅读正文并按要求参加，后续消息会通过正式渠道及时发布。",
    "",
    "![poster](https://images.very-long-english-domain.example.com/assets/english-poster-file-name.png)",
    "",
    "[报名入口](https://registration.example.com/very/long/english/path?campaign=international)",
    "",
    "```ts",
    "const extremelyLongEnglishIdentifier = 'this code must never count as visible prose';",
    "console.log(extremelyLongEnglishIdentifier);",
    "```",
  ].join("\n");
  const nonProseAnalysis = detectMarkdownLanguage(chineseWithNonProseEnglish);
  assert.equal(nonProseAnalysis.classification, "clearly_zh");
  assert.doesNotMatch(
    extractVisibleMarkdownText(chineseWithNonProseEnglish),
    /very-long-english-domain|extremelyLongEnglishIdentifier/,
  );

  const firstOutput = runBatch();
  assert.match(
    firstOutput,
    /translated: 1; skipped existing: 0; already target language: 0; failed: 0/,
  );
  const translationPath = path.join(
    enrichmentRoot,
    "translations/en/recent-article.json",
  );
  const firstTranslation = JSON.parse(await readFile(translationPath, "utf8"));
  assert.equal(firstTranslation.version, 1);
  assert.equal(firstTranslation.provider, "mock");
  assert.equal(firstTranslation.model, "identity-v1");
  assert.equal(firstTranslation.sourceLanguage, "zh");
  assert.equal(firstTranslation.content, articleBody);
  assert.equal(await readFile(articlePath, "utf8"), articleSource);
  assert.equal((await reports())[0].selection.matched, 2);
  assert.equal((await reports())[0].selection.selected, 1);
  assert.equal(
    (await reports())[0].items[0].languageDetection,
    "ambiguous",
  );

  firstTranslation.content = "SKIP-SENTINEL";
  await writeFile(
    translationPath,
    `${JSON.stringify(firstTranslation, null, 2)}\n`,
    "utf8",
  );
  const skippedOutput = runBatch();
  assert.match(
    skippedOutput,
    /translated: 0; skipped existing: 1; already target language: 0; failed: 0/,
  );
  assert.equal(
    JSON.parse(await readFile(translationPath, "utf8")).content,
    "SKIP-SENTINEL",
  );

  const forcedOutput = runBatch(["--force"]);
  assert.match(
    forcedOutput,
    /translated: 1; skipped existing: 0; already target language: 0; failed: 0/,
  );
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

  const singleOutput = runCli(["--article-id", "single-article"]);
  assert.match(singleOutput, /\[translated\] single-article/);
  const singleTranslation = JSON.parse(
    await readFile(
      path.join(enrichmentRoot, "translations/en/single-article.json"),
      "utf8",
    ),
  );
  assert.equal(singleTranslation.articleId, "single-article");
  const singleReport = (await reports()).find(
    (report) => report.selection.articleId === "single-article",
  );
  assert.ok(singleReport);
  assert.equal(singleReport.selection.mode, "article_id");
  assert.equal(singleReport.selection.articleId, "single-article");
  assert.equal(singleReport.selection.since, undefined);

  const englishCliRoot = path.join(temporaryRoot, "english-cli-enrichment");
  const englishCliOutput = runCli(
    ["--article-id", "english-article", "--force"],
    englishCliRoot,
  );
  assert.match(englishCliOutput, /\[already target language\] english-article/);
  assert.match(
    englishCliOutput,
    /translated: 0; skipped existing: 0; already target language: 1; failed: 0/,
  );
  const englishReport = (await reports(englishCliRoot))[0];
  assert.equal(englishReport.counts.alreadyTargetLanguage, 1);
  assert.equal(englishReport.items[0].status, "already_target_language");
  assert.equal(englishReport.items[0].languageDetection, "clearly_en");
  await assert.rejects(
    () =>
      access(
        path.join(
          englishCliRoot,
          "translations/en/english-article.json",
        ),
      ),
    /ENOENT/,
  );

  const unknownRoot = path.join(temporaryRoot, "unknown-enrichment");
  const unknown = spawnSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--experimental-strip-types",
      "scripts/translate-articles.mts",
      "--article-id",
      "does-not-exist",
    ],
    {
      cwd: projectRoot,
      encoding: "utf8",
      env: {
        ...process.env,
        KB_MARKDOWN_ROOT: markdownRoot,
        KB_INDEX_PATH: indexPath,
        KB_ENRICHMENT_ROOT: unknownRoot,
        TRANSLATION_PROVIDER: "mock",
      },
    },
  );
  assert.equal(unknown.status, 1);
  assert.match(unknown.stderr, /Article does-not-exist was not found in the index/);
  await assert.rejects(() => access(unknownRoot), /ENOENT/);

  const conflictingMode = spawnSync(
    process.execPath,
    [
      "--disable-warning=MODULE_TYPELESS_PACKAGE_JSON",
      "--experimental-strip-types",
      "scripts/translate-articles.mts",
      "--article-id",
      "single-article",
      "--since",
      "2026-08-01",
    ],
    { cwd: projectRoot, encoding: "utf8" },
  );
  assert.equal(conflictingMode.status, 1);
  assert.match(
    conflictingMode.stderr,
    /--article-id cannot be combined with --since or --limit/,
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
  const twoUrls = "https://example.com/first\nhttps://example.com/second";
  assert.throws(
    () =>
      assertMarkdownUrlsPreserved(
        twoUrls,
        "https://example.com/second\nhttps://example.com/first",
      ),
    /changed the Markdown URL sequence/,
  );
  assert.throws(
    () =>
      assertMarkdownUrlsPreserved(twoUrls, "https://example.com/first"),
    /changed the Markdown URL sequence/,
  );

  const structurallyRichSource = [
    "# 项目更新",
    "",
    "- **重点：** [报名链接](https://example.com/register)",
    "",
    "活动海报如下：",
    "",
    "![活动海报](https://images.example.com/poster.png)",
  ].join("\n");
  const structurallyRichTranslation = [
    "# Project Update",
    "",
    "- **Key point:** [Registration link](https://example.com/register)",
    "",
    "The event poster appears below:",
    "",
    "![Event poster](https://images.example.com/poster.png)",
  ].join("\n");
  assert.doesNotThrow(() =>
    assertMarkdownStructurePreserved(
      structurallyRichSource,
      structurallyRichTranslation,
    ),
  );

  const linkedImageSource = [
    "[",
    "![](https://images.example.com/card.png)",
    "](https://example.com/article)",
  ].join("\n");
  const brokenLinkedImage = [
    "![](https://images.example.com/card.png)",
    "](https://example.com/article)",
  ].join("\n");
  assert.doesNotThrow(() =>
    assertMarkdownUrlsPreserved(linkedImageSource, brokenLinkedImage),
  );
  assert.throws(
    () => assertMarkdownStructurePreserved(linkedImageSource, brokenLinkedImage),
    /Markdown link destination sequence/,
  );

  // Keep the exact URL-token sequence seen by the legacy validator while
  // removing the image opener, proving structural validation adds coverage.
  const removedImage = "https://images.example.com/poster.png)";
  assert.doesNotThrow(() =>
    assertMarkdownUrlsPreserved(
      "![](https://images.example.com/poster.png)",
      removedImage,
    ),
  );
  assert.throws(
    () =>
      assertMarkdownStructurePreserved(
        "![](https://images.example.com/poster.png)",
        removedImage,
      ),
    /Markdown image destination sequence/,
  );

  assert.throws(
    () =>
      assertMarkdownStructurePreserved(
        "![A](https://images.example.com/a.png)\n\n![B](https://images.example.com/b.png)",
        "![B](https://images.example.com/b.png)\n\n![A](https://images.example.com/a.png)",
      ),
    /Markdown image destination sequence/,
  );

  const fencedSource = [
    "```ts",
    "const protectedValue = '中文';",
    "```",
  ].join("\n");
  assert.doesNotThrow(() =>
    assertMarkdownStructurePreserved(
      fencedSource,
      ["```ts", "const protectedValue = '中文';", "```"].join("\n"),
    ),
  );
  assert.throws(
    () =>
      assertMarkdownStructurePreserved(
        fencedSource,
        ["```ts", "const protectedValue = '中文';"].join("\n"),
      ),
    /code-fence balance/,
  );

  assert.equal(
    detectSuspiciousChineseResidue(
      "The cyclists entered China via the Khorgos口岸 before continuing east.",
    ).suspicious,
    true,
  );
  assert.equal(
    detectSuspiciousChineseResidue(
      "The cyclists entered China through the Khorgos border crossing before continuing east.",
    ).suspicious,
    false,
  );
  assert.equal(
    detectSuspiciousChineseResidue(
      "Professor 王小明 joined the delegation at Xi'an Jiaotong University.",
    ).suspicious,
    false,
  );
  assert.equal(
    detectSuspiciousChineseResidue(
      "[Official page](https://example.com/口岸)\n\n```text\nKhorgos口岸\n```",
    ).suspicious,
    false,
  );
  assert.equal(
    detectSuspiciousChineseResidue(
      "This paragraph is English, but 后面仍然保留了一整段没有完成翻译的中文内容需要重新处理。",
    ).suspicious,
    true,
  );

  const chunkingFixture = [
    "# 标题",
    "",
    "第一段文字与[报名链接](https://example.com/register?a=1&b=2)。",
    "",
    "第二段文字。",
    "",
    "![](https://images.example.com/poster.png)",
    "",
    "https://example.com/standalone",
    "",
    "---",
    "",
    "```js",
    "const untranslated = '中文';",
    "",
    "console.log(untranslated);",
    "```",
    "",
    "最后一段。",
  ].join("\n");
  const plan = planMarkdownTranslation(chunkingFixture, 45);
  assert.equal(
    plan.map((part) => part.content).join(""),
    chunkingFixture,
  );
  assert.ok(plan.filter((part) => part.kind === "translate").length >= 2);
  const sentToModel = plan
    .filter((part) => part.kind === "translate")
    .map((part) => part.content)
    .join("\n");
  assert.doesNotMatch(sentToModel, /images\.example\.com/);
  assert.doesNotMatch(sentToModel, /example\.com\/standalone/);
  assert.doesNotMatch(sentToModel, /console\.log/);
  assert.match(sentToModel, /报名链接/);

  assert.equal(
    parseOpenAICompatibleResponse({
      choices: [{ message: { content: "Translated text" } }],
    }),
    "Translated text",
  );
  assert.equal(
    parseOpenAICompatibleResponse({
      choices: [
        {
          message: {
            content: [
              { type: "text", text: "Translated " },
              { type: "text", text: "parts" },
            ],
          },
        },
      ],
    }),
    "Translated parts",
  );
  assert.throws(
    () =>
      parseOpenAICompatibleResponse({
        choices: [
          { finish_reason: "length", message: { content: "truncated" } },
        ],
      }),
    /truncated/,
  );
  assert.throws(
    () => parseOpenAICompatibleResponse({ choices: [] }),
    /did not contain a choice/,
  );

  assert.equal(createTranslationProviderFromEnvironment({}).name, "mock");
  assert.throws(
    () =>
      createTranslationProviderFromEnvironment({
        TRANSLATION_PROVIDER: "openai-compatible",
      }),
    /TRANSLATION_API_BASE_URL is required/,
  );
  assert.throws(
    () =>
      createTranslationProviderFromEnvironment({
        TRANSLATION_PROVIDER: "unexpected",
      }),
    /Unsupported TRANSLATION_PROVIDER/,
  );

  let countingProviderCalls = 0;
  const countingProvider: TranslationProvider = {
    name: "counting-test-provider",
    model: "counting-v1",
    async translateArticle(input) {
      countingProviderCalls += 1;
      return {
        title: input.title,
        ...(input.digest === undefined ? {} : { digest: input.digest }),
        content: input.content,
      };
    },
  };
  const englishServiceRoot = path.join(
    temporaryRoot,
    "english-service-enrichment",
  );
  const englishRepository = new FileSystemTranslationRepository(
    englishServiceRoot,
  );
  const englishArticle = {
    id: "clearly-english-service-article",
    title: "English service article",
    account: "Test Account",
    digestSource: "none" as const,
    relativePath: "unused.md",
    content: clearlyEnglishBody,
  };
  const englishService = new TranslationService(
    englishRepository,
    countingProvider,
    async (id) => (id === englishArticle.id ? englishArticle : undefined),
  );
  const englishTranslationPath = englishRepository.translationPath(
    englishArticle.id,
    "en",
  );
  assert.equal(
    (await englishService.translateArticle(englishArticle.id)).status,
    "already_target_language",
  );
  assert.equal(
    (
      await englishService.translateArticle(englishArticle.id, {
        force: true,
      })
    ).status,
    "already_target_language",
  );
  assert.equal(countingProviderCalls, 0);
  await assert.rejects(() => access(englishTranslationPath), /ENOENT/);

  const preexistingEnglishRecord = {
    version: 1 as const,
    articleId: englishArticle.id,
    sourceLanguage: "zh",
    language: "en",
    title: "PREEXISTING ENGLISH CACHE",
    content: "CACHE MUST NOT BE OVERWRITTEN",
    translatedAt: "2026-08-16T00:00:00.000Z",
    provider: "old-provider",
    model: "old-model",
  };
  await englishRepository.save(preexistingEnglishRecord);
  assert.equal(
    (
      await englishService.translateArticle(englishArticle.id, {
        force: true,
      })
    ).status,
    "already_target_language",
  );
  assert.equal(countingProviderCalls, 0);
  assert.deepEqual(
    JSON.parse(await readFile(englishTranslationPath, "utf8")),
    preexistingEnglishRecord,
  );

  const apiRequests: Array<{
    source: string;
    systemPrompt: string;
    authorization: string | null;
  }> = [];
  const fakeFetch: typeof fetch = async (_input, init) => {
    const request = JSON.parse(String(init?.body));
    const source = request.messages[1].content as string;
    apiRequests.push({
      source,
      systemPrompt: request.messages[0].content,
      authorization: new Headers(init?.headers).get("authorization"),
    });
    const translated = source.includes("https://example.com/must-stay")
      ? source.replace("must-stay", "changed")
      : source;
    return new Response(
      JSON.stringify({ choices: [{ message: { content: translated } }] }),
      { status: 200, headers: { "content-type": "application/json" } },
    );
  };
  const realProviderWithFakeTransport =
    new OpenAICompatibleTranslationProvider({
      baseUrl: "https://translation.example.test/v1",
      apiKey: "test-key-never-sent-to-network",
      model: "test-model",
      fetch: fakeFetch,
      maxChunkCharacters: 40,
    });
  const failureRoot = path.join(temporaryRoot, "failure-enrichment");
  const failureRepository = new FileSystemTranslationRepository(failureRoot);
  const failingArticle = {
    id: "failure-article",
    title: "标题",
    digest: "摘要",
    account: "Test Account",
    digestSource: "frontmatter" as const,
    relativePath: "unused.md",
    content: [
      "第一段。",
      "",
      "[必须保留](https://example.com/must-stay)",
      "",
      "![](https://images.example.com/not-sent.png)",
    ].join("\n"),
  };
  const existingRecord = {
    version: 1 as const,
    articleId: failingArticle.id,
    sourceLanguage: "zh",
    language: "en",
    title: "OLD TITLE",
    content: "OLD CACHE SENTINEL",
    translatedAt: "2026-08-16T00:00:00.000Z",
    provider: "mock",
    model: "identity-v1",
  };
  const failureService = new TranslationService(
    failureRepository,
    realProviderWithFakeTransport,
    async (id) => (id === failingArticle.id ? failingArticle : undefined),
  );
  const failingPath = failureRepository.translationPath(failingArticle.id, "en");
  await assert.rejects(
    () => failureService.translateArticle(failingArticle.id),
    /changed the Markdown URL sequence/,
  );
  await assert.rejects(() => access(failingPath), /ENOENT/);

  const existingPath = await failureRepository.save(existingRecord);
  await assert.rejects(
    () => failureService.translateArticle(failingArticle.id, { force: true }),
    /changed the Markdown URL sequence/,
  );
  assert.deepEqual(
    JSON.parse(await readFile(existingPath, "utf8")),
    existingRecord,
  );

  const structuralFailureRoot = path.join(
    temporaryRoot,
    "structural-failure-enrichment",
  );
  const structuralFailureRepository = new FileSystemTranslationRepository(
    structuralFailureRoot,
  );
  const structuralFailureArticle = {
    id: "structural-failure-article",
    title: "结构安全测试",
    account: "Test Account",
    digestSource: "none" as const,
    relativePath: "unused.md",
    content: [
      "# 结构安全测试",
      "",
      "这是一篇用于验证翻译结构安全的中文文章，正文包含足够的信息并需要完整保留链接图片关系。",
      "",
      linkedImageSource,
    ].join("\n"),
  };
  const structuralFailureProvider: TranslationProvider = {
    name: "structural-failure-provider",
    model: "broken-markdown-v1",
    async translateArticle() {
      return {
        title: "Translation Structure Safety Test",
        content: [
          "# Translation Structure Safety Test",
          "",
          "This article verifies that linked-image structure remains intact.",
          "",
          brokenLinkedImage,
        ].join("\n"),
      };
    },
  };
  const structuralFailureService = new TranslationService(
    structuralFailureRepository,
    structuralFailureProvider,
    async (id) =>
      id === structuralFailureArticle.id
        ? structuralFailureArticle
        : undefined,
  );
  const structuralFailurePath = structuralFailureRepository.translationPath(
    structuralFailureArticle.id,
    "en",
  );
  await assert.rejects(
    () => structuralFailureService.translateArticle(structuralFailureArticle.id),
    /Markdown link destination sequence/,
  );
  await assert.rejects(() => access(structuralFailurePath), /ENOENT/);

  const previousStructuralRecord = {
    version: 1 as const,
    articleId: structuralFailureArticle.id,
    sourceLanguage: "zh",
    language: "en",
    title: "PREVIOUS VALID TITLE",
    content: "PREVIOUS VALID CACHE",
    translatedAt: "2026-08-16T00:00:00.000Z",
    provider: "previous-provider",
    model: "previous-model",
  };
  await structuralFailureRepository.save(previousStructuralRecord);
  await assert.rejects(
    () =>
      structuralFailureService.translateArticle(structuralFailureArticle.id, {
        force: true,
      }),
    /Markdown link destination sequence/,
  );
  assert.deepEqual(
    JSON.parse(await readFile(structuralFailurePath, "utf8")),
    previousStructuralRecord,
  );

  const residueRepository = new FileSystemTranslationRepository(
    path.join(temporaryRoot, "residue-failure-enrichment"),
  );
  const residueArticle = {
    id: "residue-failure-article",
    title: "中文残留测试",
    account: "Test Account",
    digestSource: "none" as const,
    relativePath: "unused.md",
    content:
      "这是一篇用于检测翻译结果中可疑中文残留的文章，正文包含足够多的中文信息来触发翻译流程。",
  };
  const residueProvider: TranslationProvider = {
    name: "residue-test-provider",
    model: "residue-v1",
    async translateArticle() {
      return {
        title: "Chinese Residue Test",
        content:
          "The cyclists entered China via the Khorgos口岸 before continuing east.",
      };
    },
  };
  const residueService = new TranslationService(
    residueRepository,
    residueProvider,
    async (id) => (id === residueArticle.id ? residueArticle : undefined),
  );
  await assert.rejects(
    () => residueService.translateArticle(residueArticle.id),
    /suspicious Chinese residue.*Khorgos口岸/,
  );
  await assert.rejects(
    () => access(residueRepository.translationPath(residueArticle.id, "en")),
    /ENOENT/,
  );

  assert.ok(apiRequests.length >= 3);
  assert.ok(
    apiRequests.every(
      (request) =>
        request.authorization === "Bearer test-key-never-sent-to-network",
    ),
  );
  assert.match(apiRequests[0].systemPrompt, /telephone number/);
  assert.match(apiRequests[0].systemPrompt, /Do not add a summary/);
  assert.match(
    apiRequests[0].systemPrompt,
    /西交利物浦大学 → Xi'an Jiaotong-Liverpool University/,
  );
  assert.match(apiRequests[0].systemPrompt, /西浦 → XJTLU/);
  assert.match(
    apiRequests[0].systemPrompt,
    /西安交通大学 → Xi'an Jiaotong University/,
  );
  assert.doesNotMatch(
    apiRequests[0].systemPrompt,
    /西安交通大学 → Xi'an Jiaotong-Liverpool University/,
  );
  assert.match(
    apiRequests[0].systemPrompt,
    /professional English copy suitable for an international university website/,
  );
  assert.match(
    apiRequests[0].systemPrompt,
    /concise, idiomatic English news headline/,
  );
  assert.match(apiRequests[0].systemPrompt, /not as a literal word-for-word/);
  assert.match(apiRequests[0].systemPrompt, /Return only the translated result/);
  assert.deepEqual(
    TRANSLATION_GLOSSARY.map(({ source, target }) => [source, target]),
    [
      ["西交利物浦大学", "Xi'an Jiaotong-Liverpool University"],
      ["西浦", "XJTLU"],
      ["西安交通大学", "Xi'an Jiaotong University"],
      ["利物浦大学", "University of Liverpool"],
    ],
  );
  assert.ok(
    apiRequests.every(
      (request) => !request.source.includes("images.example.com/not-sent.png"),
    ),
  );

  console.log(
    "Translation pipeline fixtures passed: language guard, single-id selection, storage, report statuses, skip, force, chunking, response parsing, URL validation, and failure-safe cache writes.",
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
