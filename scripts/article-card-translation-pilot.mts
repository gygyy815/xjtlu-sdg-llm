import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { getArticleById, searchArticleSummaries } from "../lib/knowledge-base/repository.ts";
import { articleCardSourceHash, FileSystemArticleCardTranslationRepository } from "../lib/article-card-presentation.ts";
import { getTranslationStatus } from "../lib/translation/status.ts";
import { translationSourceHash } from "../lib/translation/source-hash.ts";
import { OpenAICompatibleTranslationProvider } from "../lib/translation/provider.ts";

const limit = Number(process.argv.find((arg) => arg.startsWith("--limit="))?.split("=")[1] ?? "100");
const concurrency = Number(process.argv.find((arg) => arg.startsWith("--concurrency="))?.split("=")[1] ?? process.env.CARD_TRANSLATION_CONCURRENCY ?? "3");
if (!Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error("--limit must be an integer from 1 to 100");
if (!Number.isSafeInteger(concurrency) || concurrency < 1 || concurrency > 3) throw new Error("--concurrency must be an integer from 1 to 3");

async function writeJsonAtomically(destination: string, value: unknown) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
}

function failureCategory(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  if (/timeout|network|HTTP|fetch/iu.test(message)) return "provider_error";
  if (/empty|title|summary/iu.test(message)) return "invalid_card_output";
  return "other";
}

const startedAt = new Date().toISOString();
const result = await searchArticleSummaries({ page: 1, pageSize: limit, sort: "newest" });
const selected = result.items.slice(0, limit);
const repository = new FileSystemArticleCardTranslationRepository();
const apiKey = process.env.SILICONFLOW_API_KEY?.trim();
const baseUrl = (process.env.SILICONFLOW_BASE_URL || process.env.SILICONFLOW_API_BASE)?.trim();
const model = process.env.SILICONFLOW_TRANSLATION_MODEL?.trim() || "Qwen/Qwen3-8B";
if (!apiKey || !baseUrl) throw new Error("Card pilot requires SILICONFLOW_API_KEY and SILICONFLOW_BASE_URL");
const provider = new OpenAICompatibleTranslationProvider({ apiKey, baseUrl, model, maxChunkCharacters: 1_200, maxAttempts: 3 });

async function mapWithConcurrency<T, R>(items: readonly T[], maxConcurrency: number, worker: (item: T, index: number) => Promise<R>) {
  const results = new Array<R>(items.length);
  let next = 0;
  const runners = Array.from({ length: Math.min(maxConcurrency, items.length) }, async () => {
    while (true) {
      const index = next++;
      if (index >= items.length) return;
      results[index] = await worker(items[index], index);
    }
  });
  await Promise.all(runners);
  return results;
}
const reportRoot = path.resolve(process.env.KB_ENRICHMENT_ROOT?.trim() || process.cwd(), "reports", "article-card-translations");
const runId = `article-card-${startedAt.replace(/[-:.TZ]/gu, "").slice(0, 14)}`;
const manifest = [] as Array<Record<string, unknown>>;
for (const summary of selected) {
  const article = await getArticleById(summary.id);
  manifest.push({
    articleId: summary.id,
    title: summary.title,
    publishedAt: summary.publishedAt,
    cardSourceHash: articleCardSourceHash(summary),
    ...(article ? { sourceHash: translationSourceHash(article) } : {}),
  });
}
await writeJsonAtomically(path.join(reportRoot, `${runId}-manifest.json`), { version: 1, runId, createdAt: startedAt, route: "/articles", order: "newest", selected: manifest });

type PilotItem = {
  articleId: string;
  title: string;
  status: "full_cache_reused" | "card_cache_reused" | "card_translated" | "already_target_language" | "failed";
  attempts: number;
  apiRequests: number;
  elapsedMs: number;
  sourceHash?: string;
  cardSourceHash: string;
  storagePath?: string;
  error?: string;
  failureCategory?: string;
};

const items = await mapWithConcurrency(selected, concurrency, async (summary): Promise<PilotItem> => {
  const started = Date.now();
  const cardHash = articleCardSourceHash(summary);
  const article = await getArticleById(summary.id);
  if (!article) return { articleId: summary.id, title: summary.title, status: "failed", attempts: 0, apiRequests: 0, elapsedMs: Date.now() - started, cardSourceHash: cardHash, error: "article_not_found", failureCategory: "other" };
  const sourceHash = translationSourceHash(article);
  let fullStatus;
  try { fullStatus = await getTranslationStatus(summary.id, { article }); } catch { fullStatus = undefined; }
  if (fullStatus?.sourceIsEnglish) return { articleId: summary.id, title: summary.title, status: "already_target_language", attempts: 0, apiRequests: 0, elapsedMs: Date.now() - started, sourceHash, cardSourceHash: cardHash };
  if (fullStatus?.status === "fresh" && fullStatus.record?.version === 2) return { articleId: summary.id, title: summary.title, status: "full_cache_reused", attempts: 0, apiRequests: 0, elapsedMs: Date.now() - started, sourceHash, cardSourceHash: cardHash };
  const existing = await repository.get(summary.id);
  if (existing?.sourceHash === cardHash) return { articleId: summary.id, title: summary.title, status: "card_cache_reused", attempts: 0, apiRequests: 0, elapsedMs: Date.now() - started, sourceHash, cardSourceHash: cardHash, storagePath: repository.translationPath(summary.id) };

  const sourceSummary = article.summary ?? article.digest;
  let lastError: unknown;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    const before = provider.getRequestTelemetry().length;
    try {
      const translated = await provider.translateArticle({ id: article.id, title: article.title, ...(article.summary !== undefined ? { summary: article.summary } : article.digest !== undefined ? { digest: article.digest } : {}), ...(article.publishedAt ? { publishedAt: article.publishedAt } : {}), content: "", sourceLanguage: "zh", targetLanguage: "en" });
      const translatedTitle = translated.title;
      const translatedSummary = translated.summary ?? translated.digest;
      if (!translatedTitle.trim() || (sourceSummary !== undefined && !translatedSummary?.trim())) throw new Error("card translation returned an empty title or summary");
      const record = {
        version: 1 as const,
        articleId: article.id,
        sourceHash: cardHash,
        language: "en" as const,
        title: translatedTitle.trim(),
        ...(translatedSummary?.trim() ? { summary: translatedSummary.trim() } : {}),
        translatedAt: new Date().toISOString(),
        provider: provider.name,
        model: provider.model,
        processingVersion: "article-card-v1" as const,
      };
      const storagePath = await repository.save(record);
      return { articleId: summary.id, title: summary.title, status: "card_translated", attempts: attempt, apiRequests: provider.getRequestTelemetry().length - before, elapsedMs: Date.now() - started, sourceHash, cardSourceHash: cardHash, storagePath };
    } catch (error) {
      lastError = error;
    }
  }
  const errorMessage = lastError instanceof Error ? lastError.message : String(lastError);
  return { articleId: summary.id, title: summary.title, status: "failed", attempts: 3, apiRequests: provider.getRequestTelemetry().filter((request) => request.articleId === article.id).length, elapsedMs: Date.now() - started, sourceHash, cardSourceHash: cardHash, error: errorMessage, failureCategory: failureCategory(lastError) };
});

const completedAt = new Date().toISOString();
const failures: Record<string, number> = {};
for (const item of items) if (item.status === "failed") failures[item.failureCategory ?? "other"] = (failures[item.failureCategory ?? "other"] ?? 0) + 1;
const report = {
  version: 1,
  runId,
  startedAt,
  completedAt,
  route: "/articles",
  order: "newest",
  selected: selected.length,
  provider: provider.name,
  model: provider.model,
  execution: {
    fullCacheReused: items.filter((item) => item.status === "full_cache_reused").length,
    cardCacheReused: items.filter((item) => item.status === "card_cache_reused").length,
    alreadyTargetLanguage: items.filter((item) => item.status === "already_target_language").length,
    cardTranslated: items.filter((item) => item.status === "card_translated").length,
    failed: items.filter((item) => item.status === "failed").length,
  },
  metrics: {
    apiRequests: provider.getRequestTelemetry().length,
    successfulApiRequests: provider.getRequestTelemetry().filter((request) => request.success).length,
    totalElapsedMs: Date.parse(completedAt) - Date.parse(startedAt),
    totalPromptTokens: provider.getRequestTelemetry().reduce((sum, request) => sum + (((request as unknown as { usage?: { promptTokens?: number } }).usage?.promptTokens) ?? 0), 0),
    totalCompletionTokens: provider.getRequestTelemetry().reduce((sum, request) => sum + (((request as unknown as { usage?: { completionTokens?: number } }).usage?.completionTokens) ?? 0), 0),
  },
  failureDistribution: failures,
  items,
};
await writeJsonAtomically(path.join(reportRoot, `${runId}.json`), report);
console.log(JSON.stringify({ runId, selected: selected.length, execution: report.execution, failureDistribution: failures, report: path.join(reportRoot, `${runId}.json`) }, null, 2));
if (report.execution.failed > 0) process.exitCode = 1;
