import { randomUUID } from "node:crypto";
import path from "node:path";
import { getArticleById, loadIndex } from "../lib/knowledge-base/repository.ts";
import type { ArticleSummary } from "../lib/knowledge-base/types.ts";
import { createTranslationProviderFromEnvironment } from "../lib/translation/provider.ts";
import { FileSystemTranslationRepository } from "../lib/translation/repository.ts";
import { TranslationService } from "../lib/translation/service.ts";
import type {
  TranslationBatchItem,
  TranslationBatchReport,
} from "../lib/translation/types.ts";

type CliOptions =
  | {
      mode: "since";
      since: string;
      limit: number;
      force: boolean;
    }
  | {
      mode: "article_id";
      articleId: string;
      force: boolean;
    };

const DEFAULT_LIMIT = 20;

function usage() {
  return [
    "Usage: npm run translate:articles -- --since YYYY-MM-DD [--limit N] [--force]",
    "       npm run translate:articles -- --article-id ID [--force]",
    "",
    "Selection modes:",
    "  --since and optional --limit select a newest-first date batch.",
    "  --article-id selects exactly one article and cannot be combined with --since or --limit.",
    "",
    "Environment:",
    "  KB_MARKDOWN_ROOT    Read-only root containing source Markdown",
    "  KB_INDEX_PATH       Optional full index path (defaults to data/full-kb-index.json)",
    "  KB_ENRICHMENT_ROOT  Writable root for translations and reports",
    "  TRANSLATION_PROVIDER  mock (default) or openai-compatible",
    "  TRANSLATION_API_BASE_URL  API base URL; required for openai-compatible",
    "  TRANSLATION_API_KEY       API key; required for openai-compatible",
    "  TRANSLATION_MODEL         Model name; required for openai-compatible",
    "",
    `--limit defaults to ${DEFAULT_LIMIT}. The default mock provider makes no network calls.`,
  ].join("\n");
}

function validCalendarDate(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!match) return false;
  const date = new Date(`${value}T00:00:00.000Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function parseArguments(argv: string[]): CliOptions | { help: true } {
  let since: string | undefined;
  let limit = DEFAULT_LIMIT;
  let limitSeen = false;
  let articleId: string | undefined;
  let force = false;

  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--help" || argument === "-h") return { help: true };
    if (argument === "--force") {
      if (force) throw new Error("--force may only be specified once");
      force = true;
      continue;
    }

    let name: string;
    let value: string | undefined;
    const equals = argument.indexOf("=");
    if (equals >= 0) {
      name = argument.slice(0, equals);
      value = argument.slice(equals + 1);
    } else {
      name = argument;
      value = argv[index + 1];
      index += 1;
    }

    if (name === "--since") {
      if (since !== undefined) throw new Error("--since may only be specified once");
      if (!value || !validCalendarDate(value)) {
        throw new Error("--since must be a valid date in YYYY-MM-DD format");
      }
      since = value;
    } else if (name === "--article-id") {
      if (articleId !== undefined) {
        throw new Error("--article-id may only be specified once");
      }
      if (!value?.trim() || value.startsWith("--")) {
        throw new Error("--article-id requires a non-empty id");
      }
      articleId = value.trim();
    } else if (name === "--limit") {
      if (limitSeen) throw new Error("--limit may only be specified once");
      if (!/^\d+$/.test(value ?? "") || Number(value) < 1) {
        throw new Error("--limit must be a positive integer");
      }
      limit = Number(value);
      if (!Number.isSafeInteger(limit)) throw new Error("--limit is too large");
      limitSeen = true;
    } else {
      throw new Error(`Unknown argument: ${name}`);
    }
  }

  if (articleId !== undefined) {
    if (since !== undefined || limitSeen) {
      throw new Error(
        "--article-id cannot be combined with --since or --limit; choose one selection mode",
      );
    }
    return { mode: "article_id", articleId, force };
  }
  if (!since) {
    throw new Error("Either --since or --article-id is required");
  }
  return { mode: "since", since, limit, force };
}

function configuredIndexPath() {
  const configured = process.env.KB_INDEX_PATH?.trim();
  const projectRoot = path.resolve(process.env.PROJECT_ROOT?.trim() || process.cwd());
  return configured
    ? path.resolve(configured)
    : path.join(projectRoot, "data/full-kb-index.json");
}

function reportRunId(startedAt: string) {
  const timestamp = startedAt.replace(/[-:.]/g, "");
  return `translation-en-${timestamp}-${randomUUID().slice(0, 8)}`;
}

function normalizedPublishedDate(publishedAt: string | undefined) {
  return publishedAt?.match(/^(\d{4}-\d{2}-\d{2})(?:$|T)/)?.[1];
}

async function main() {
  let parsed: ReturnType<typeof parseArguments>;
  try {
    parsed = parseArguments(process.argv.slice(2));
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error(`Translation batch failed: ${message}\n\n${usage()}`);
    process.exitCode = 1;
    return;
  }
  if ("help" in parsed) {
    console.log(usage());
    return;
  }

  const startedAt = new Date().toISOString();
  const provider = createTranslationProviderFromEnvironment();
  const repository = new FileSystemTranslationRepository();
  const service = new TranslationService(
    repository,
    provider,
    getArticleById,
  );
  const index = await loadIndex();
  let matching: ArticleSummary[];
  let selected: ArticleSummary[];
  if (parsed.mode === "article_id") {
    const article = index.get(parsed.articleId);
    if (!article) {
      throw new Error(`Article ${parsed.articleId} was not found in the index`);
    }
    matching = [article];
    selected = [article];
  } else {
    matching = [...index.values()]
      .filter((article) => {
        const publishedDate = normalizedPublishedDate(article.publishedAt);
        return publishedDate !== undefined && publishedDate >= parsed.since;
      })
      .sort((left, right) => {
        const byDate = (right.publishedAt ?? "").localeCompare(
          left.publishedAt ?? "",
        );
        return byDate || left.id.localeCompare(right.id);
      });
    selected = matching.slice(0, parsed.limit);
  }
  const items: TranslationBatchItem[] = [];

  for (const article of selected) {
    try {
      const result = await service.translateArticle(article.id, {
        force: parsed.force,
      });
      items.push({
        articleId: article.id,
        title: article.title,
        ...(article.publishedAt === undefined
          ? {}
          : { publishedAt: article.publishedAt }),
        status: result.status,
        languageDetection: result.languageDetection,
        ...("storagePath" in result
          ? { storagePath: result.storagePath }
          : {}),
      });
      const label =
        result.status === "translated"
          ? "translated"
          : result.status === "skipped_existing"
            ? "skipped existing"
            : "already target language";
      console.log(`[${label}] ${article.id}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      items.push({
        articleId: article.id,
        title: article.title,
        ...(article.publishedAt === undefined
          ? {}
          : { publishedAt: article.publishedAt }),
        status: "failed",
        error: message,
      });
      console.error(`[failed] ${article.id}: ${message}`);
    }
  }

  const report: TranslationBatchReport = {
    version: 1,
    runId: reportRunId(startedAt),
    startedAt,
    completedAt: new Date().toISOString(),
    sourceLanguage: "zh",
    targetLanguage: "en",
    provider: provider.name,
    model: provider.model,
    selection: {
      mode: parsed.mode,
      indexPath: configuredIndexPath(),
      ...(parsed.mode === "since"
        ? { since: parsed.since, limit: parsed.limit }
        : { articleId: parsed.articleId }),
      force: parsed.force,
      matched: matching.length,
      selected: selected.length,
    },
    counts: {
      translated: items.filter((item) => item.status === "translated").length,
      skippedExisting: items.filter(
        (item) => item.status === "skipped_existing",
      ).length,
      alreadyTargetLanguage: items.filter(
        (item) => item.status === "already_target_language",
      ).length,
      failed: items.filter((item) => item.status === "failed").length,
    },
    items,
  };
  const reportPath = await repository.saveReport(report);

  console.log(
    `Selected: ${report.selection.selected}; translated: ${report.counts.translated}; skipped existing: ${report.counts.skippedExisting}; already target language: ${report.counts.alreadyTargetLanguage}; failed: ${report.counts.failed}`,
  );
  console.log(`Report: ${reportPath}`);
  if (report.counts.failed > 0) process.exitCode = 1;
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  console.error(`Translation batch failed: ${message}`);
  process.exitCode = 1;
});
