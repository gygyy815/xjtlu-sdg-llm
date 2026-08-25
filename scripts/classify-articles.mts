import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { classifyArticleMetadata } from "../lib/classification/rules.ts";
import { ACADEMIC_ORGANIZATION_UNITS } from "../lib/classification/organization-units.ts";
import type { ArticleSummary } from "../lib/knowledge-base/types.ts";

const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);

type Options = {
  indexPath: string;
  reportDirectory: string;
  sampleSize: number;
  runId: string;
  baselineReportPath?: string;
};

function optionValue(arguments_: string[], index: number, name: string) {
  const argument = arguments_[index];
  if (argument === name) return arguments_[index + 1];
  if (argument.startsWith(`${name}=`)) return argument.slice(name.length + 1);
  return undefined;
}

function defaultRunId() {
  return `dry-run-${new Date().toISOString().replace(/[:.]/g, "-")}`;
}

function parseArguments(arguments_: string[]): Options {
  let indexPath = process.env.KB_INDEX_PATH?.trim()
    ? path.resolve(process.env.KB_INDEX_PATH)
    : path.join(projectRoot, "data", "full-kb-index.json");
  let reportDirectory = path.join(projectRoot, "reports", "classification");
  let sampleSize = 250;
  let runId = defaultRunId();
  let baselineReportPath: string | undefined;

  for (let index = 0; index < arguments_.length; index += 1) {
    const argument = arguments_[index];
    if (argument === "--dry-run") continue;
    if (argument === "--write" || argument === "--apply") {
      throw new Error(
        `${argument} is intentionally unsupported; this milestone is report-only`,
      );
    }
    const candidates = [
      "--index",
      "--report-dir",
      "--sample-size",
      "--run-id",
      "--baseline-report",
    ];
    const name = candidates.find(
      (candidate) => argument === candidate || argument.startsWith(`${candidate}=`),
    );
    if (!name) throw new Error(`Unknown argument: ${argument}`);
    const value = optionValue(arguments_, index, name);
    if (argument === name) index += 1;
    if (!value) throw new Error(`${name} requires a value`);
    if (name === "--index") indexPath = path.resolve(value);
    if (name === "--report-dir") reportDirectory = path.resolve(value);
    if (name === "--baseline-report") baselineReportPath = path.resolve(value);
    if (name === "--run-id") {
      if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value)) {
        throw new Error("--run-id must be a safe path segment");
      }
      runId = value;
    }
    if (name === "--sample-size") {
      if (!/^\d+$/.test(value) || Number(value) < 1) {
        throw new Error("--sample-size must be a positive integer");
      }
      sampleSize = Number(value);
    }
  }
  return {
    indexPath,
    reportDirectory,
    sampleSize,
    runId,
    ...(baselineReportPath ? { baselineReportPath } : {}),
  };
}

function isMetadataArticle(value: unknown): value is ArticleSummary {
  if (value === null || typeof value !== "object") return false;
  const article = value as Partial<ArticleSummary>;
  return (
    typeof article.id === "string" &&
    typeof article.title === "string" &&
    typeof article.account === "string" &&
    (article.digest === undefined || typeof article.digest === "string") &&
    (article.publishedAt === undefined || typeof article.publishedAt === "string")
  );
}

async function loadMetadataIndex(sourcePath: string) {
  const parsed: unknown = JSON.parse(await readFile(sourcePath, "utf8"));
  if (!Array.isArray(parsed)) {
    throw new Error(`Metadata index must be an array: ${sourcePath}`);
  }
  for (const [position, article] of parsed.entries()) {
    if (!isMetadataArticle(article)) {
      throw new Error(`Invalid metadata article at position ${position}`);
    }
  }
  return parsed;
}

type DryRunArticle = ReturnType<typeof classifyArticleMetadata> & {
  articleId: string;
  title: string;
  account: string;
  publishedAt?: string;
  digestAvailable: boolean;
  digestExcerpt?: string;
};

function increment(counts: Record<string, number>, key: string) {
  counts[key] = (counts[key] ?? 0) + 1;
}

function orderedCounts(counts: Record<string, number>) {
  return Object.fromEntries(
    Object.entries(counts).sort(
      ([leftKey, leftCount], [rightKey, rightCount]) =>
        rightCount - leftCount || leftKey.localeCompare(rightKey, "en"),
    ),
  );
}

function percentage(count: number, total: number) {
  return total === 0 ? 0 : Number(((count / total) * 100).toFixed(2));
}

function digestExcerpt(digest: string | undefined) {
  const normalized = digest?.replace(/\s+/gu, " ").trim();
  if (!normalized) return undefined;
  return normalized.length <= 500 ? normalized : `${normalized.slice(0, 497)}...`;
}

function evidenceRuleFamily(evidence: string) {
  return evidence.match(/^(?:title|digest):[^:]+:([^:]+):/)?.[1];
}

function stableOrder(left: DryRunArticle, right: DryRunArticle) {
  return left.articleId.localeCompare(right.articleId, "en");
}

function dateStratum(publishedAt: string | undefined) {
  const year = Number(publishedAt?.slice(0, 4));
  if (!Number.isInteger(year)) return "date:unknown";
  if (year <= 2019) return "date:through-2019";
  if (year <= 2023) return "date:2020-2023";
  return "date:2024-plus";
}

function sampleStrata(article: DryRunArticle) {
  const strata = [
    dateStratum(article.publishedAt),
    `type:${article.contentType ?? article.contentTypeStatus}`,
    `domain:${article.primaryDomain ?? "unresolved"}`,
    `account:${article.account || "(empty account)"}`,
    `digest:${article.digestAvailable ? "available" : "missing"}`,
  ];
  if (!article.organizationUnit) strata.push("organization:unmapped");
  if (article.organizationUnit) {
    strata.push(`organization:${article.organizationUnit}`);
    if (ACADEMIC_ORGANIZATION_UNITS.has(article.organizationUnit)) {
      strata.push("organization:major-schools-academies");
    }
  }
  if (article.conflicts.length > 0) strata.push("classification:conflict");
  return strata;
}

function stratifiedSample(articles: DryRunArticle[], requestedSize: number) {
  const target = Math.min(requestedSize, articles.length);
  const buckets = new Map<string, DryRunArticle[]>();
  for (const article of [...articles].sort(stableOrder)) {
    for (const stratum of sampleStrata(article)) {
      const bucket = buckets.get(stratum) ?? [];
      bucket.push(article);
      buckets.set(stratum, bucket);
    }
  }
  const orderedBuckets = [...buckets.entries()].sort(([left], [right]) =>
    left.localeCompare(right, "en"),
  );
  const selected = new Map<string, DryRunArticle>();
  const maximumDepth = Math.max(0, ...orderedBuckets.map(([, bucket]) => bucket.length));
  for (let depth = 0; depth < maximumDepth && selected.size < target; depth += 1) {
    for (const [, bucket] of orderedBuckets) {
      const article = bucket[depth];
      if (article && !selected.has(article.articleId)) {
        selected.set(article.articleId, article);
        if (selected.size === target) break;
      }
    }
  }
  if (selected.size < target) {
    for (const article of [...articles].sort(stableOrder)) {
      selected.set(article.articleId, article);
      if (selected.size === target) break;
    }
  }
  return [...selected.values()];
}

function csvCell(value: unknown) {
  const stringValue = String(value ?? "");
  return /[",\r\n]/.test(stringValue)
    ? `"${stringValue.replace(/"/g, '""')}"`
    : stringValue;
}

function sampleCsv(sample: DryRunArticle[]) {
  const headers = [
    "articleId",
    "title",
    "account",
    "publishedAt",
    "digestAvailable",
    "digestExcerpt",
    "organizationUnit",
    "primaryDomain",
    "secondaryDomain",
    "contentType",
    "contentTypeStatus",
    "classificationMethod",
    "classificationVersion",
    "ruleEvidence",
    "contentTypeScores",
    "conflicts",
  ];
  const rows = sample.map((article) => [
    article.articleId,
    article.title,
    article.account,
    article.publishedAt,
    article.digestAvailable,
    article.digestExcerpt,
    article.organizationUnit,
    article.primaryDomain,
    article.secondaryDomains[0],
    article.contentType,
    article.contentTypeStatus,
    article.classification.method,
    article.classification.version,
    article.evidence.join("; "),
    article.contentTypeScores
      .filter(({ score }) => score > 0)
      .map(({ type, score, evidenceScore, priorScore }) =>
        `${type}=${score}(evidence:${evidenceScore},prior:${priorScore})`,
      )
      .join("; "),
    article.conflicts.join("; "),
  ]);
  return [headers, ...rows]
    .map((row) => row.map(csvCell).join(","))
    .join("\n") + "\n";
}

async function writeAtomically(destination: string, content: string) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, content, "utf8");
  await rename(temporary, destination);
}

function diagnosticDistribution(
  articles: DryRunArticle[],
  keyFor: (article: DryRunArticle) => string,
) {
  const rows = new Map<
    string,
    { key: string; count: number; digestAvailable: number; digestMissing: number }
  >();
  for (const article of articles) {
    const key = keyFor(article);
    const row = rows.get(key) ?? {
      key,
      count: 0,
      digestAvailable: 0,
      digestMissing: 0,
    };
    row.count += 1;
    if (article.digestAvailable) row.digestAvailable += 1;
    else row.digestMissing += 1;
    rows.set(key, row);
  }
  return [...rows.values()].sort(
    (left, right) =>
      right.count - left.count || left.key.localeCompare(right.key, "zh-CN"),
  );
}

type BaselineReport = {
  runId?: string;
  totals?: {
    contentTypeClassified?: number;
    contentTypeAmbiguous?: number;
    contentTypeUnresolved?: number;
  };
  coveragePercent?: { contentType?: number };
};

async function loadBaselineReport(sourcePath: string | undefined) {
  if (!sourcePath) return undefined;
  const parsed = JSON.parse(await readFile(sourcePath, "utf8")) as BaselineReport;
  if (
    typeof parsed.totals?.contentTypeClassified !== "number" ||
    typeof parsed.totals.contentTypeAmbiguous !== "number" ||
    typeof parsed.totals.contentTypeUnresolved !== "number" ||
    typeof parsed.coveragePercent?.contentType !== "number"
  ) {
    throw new Error(`Baseline report has an unsupported shape: ${sourcePath}`);
  }
  return parsed;
}

async function main() {
  const options = parseArguments(process.argv.slice(2));
  const baselineReport = await loadBaselineReport(options.baselineReportPath);
  const metadata = await loadMetadataIndex(options.indexPath);
  const results: DryRunArticle[] = metadata.map((article) => ({
    articleId: article.id,
    title: article.title,
    account: article.account,
    ...(article.publishedAt ? { publishedAt: article.publishedAt } : {}),
    digestAvailable:
      typeof article.digest === "string" && article.digest.trim().length > 0,
    ...(digestExcerpt(article.digest)
      ? { digestExcerpt: digestExcerpt(article.digest) }
      : {}),
    ...classifyArticleMetadata(article),
  }));

  const organizationCounts: Record<string, number> = {};
  const primaryDomainCounts: Record<string, number> = {};
  const secondaryDomainCounts: Record<string, number> = {};
  const contentTypeCounts: Record<string, number> = {};
  const contentTypeRuleFamilyCounts: Record<string, number> = {};
  const contentTypeStatusByDomain: Record<
    string,
    { classified: number; ambiguous: number; unresolved: number }
  > = {};
  const unmappedAccountCounts: Record<string, number> = {};
  const conflictCounts: Record<string, number> = {};
  let organizationMapped = 0;
  let primaryDomainClassified = 0;
  let secondaryDomainAssignments = 0;
  let contentTypeClassified = 0;
  let contentTypeAmbiguous = 0;

  for (const article of results) {
    if (article.organizationUnit) {
      organizationMapped += 1;
      increment(organizationCounts, article.organizationUnit);
    } else {
      increment(unmappedAccountCounts, article.account || "(empty account)");
    }
    if (article.primaryDomain) {
      primaryDomainClassified += 1;
      increment(primaryDomainCounts, article.primaryDomain);
    }
    for (const domain of article.secondaryDomains) {
      secondaryDomainAssignments += 1;
      increment(secondaryDomainCounts, domain);
    }
    if (article.contentType) {
      contentTypeClassified += 1;
      increment(contentTypeCounts, article.contentType);
      const families = new Set(
        article.evidence
          .map(evidenceRuleFamily)
          .filter((family): family is string => Boolean(family)),
      );
      for (const family of families) {
        increment(contentTypeRuleFamilyCounts, family);
      }
    }
    if (article.contentTypeStatus === "ambiguous") contentTypeAmbiguous += 1;
    const domain = article.primaryDomain ?? "(unmapped)";
    const domainStatus = contentTypeStatusByDomain[domain] ?? {
      classified: 0,
      ambiguous: 0,
      unresolved: 0,
    };
    domainStatus[article.contentTypeStatus] += 1;
    contentTypeStatusByDomain[domain] = domainStatus;
    for (const conflict of article.conflicts) increment(conflictCounts, conflict);
  }

  const total = results.length;
  const topUnmappedAccounts = Object.entries(unmappedAccountCounts)
    .sort(
      ([leftAccount, leftCount], [rightAccount, rightCount]) =>
        rightCount - leftCount || leftAccount.localeCompare(rightAccount, "zh-CN"),
    )
    .map(([account, count]) => ({ account, count }));
  const sample = stratifiedSample(results, options.sampleSize);
  const unresolvedArticles = results.filter(
    ({ contentTypeStatus }) => contentTypeStatus === "unresolved",
  );
  const unresolvedSample = stratifiedSample(unresolvedArticles, 100);
  const contentTypeUnresolved = unresolvedArticles.length;
  const contentTypeCoverage = percentage(contentTypeClassified, total);
  const comparison = baselineReport
    ? {
        baselineRunId: baselineReport.runId,
        before: {
          classified: baselineReport.totals!.contentTypeClassified,
          ambiguous: baselineReport.totals!.contentTypeAmbiguous,
          unresolved: baselineReport.totals!.contentTypeUnresolved,
          coveragePercent: baselineReport.coveragePercent!.contentType,
        },
        after: {
          classified: contentTypeClassified,
          ambiguous: contentTypeAmbiguous,
          unresolved: contentTypeUnresolved,
          coveragePercent: contentTypeCoverage,
        },
        delta: {
          classified:
            contentTypeClassified -
            baselineReport.totals!.contentTypeClassified!,
          ambiguous:
            contentTypeAmbiguous -
            baselineReport.totals!.contentTypeAmbiguous!,
          unresolved:
            contentTypeUnresolved -
            baselineReport.totals!.contentTypeUnresolved!,
          coveragePercentagePoints: Number(
            (
              contentTypeCoverage - baselineReport.coveragePercent!.contentType!
            ).toFixed(2),
          ),
        },
      }
    : undefined;
  const report = {
    version: 2,
    mode: "dry-run",
    runId: options.runId,
    generatedAt: new Date().toISOString(),
    sourceIndex: options.indexPath,
    safety: {
      articleBodiesRead: false,
      classificationRecordsWritten: false,
      classificationIndexReplaced: false,
      llmCalled: false,
    },
    totals: {
      articles: total,
      organizationMapped,
      organizationUnmapped: total - organizationMapped,
      primaryDomainClassified,
      primaryDomainUnresolved: total - primaryDomainClassified,
      secondaryDomainAssignments,
      contentTypeClassified,
      contentTypeAmbiguous,
      contentTypeUnresolved,
      ruleConflicts: Object.values(conflictCounts).reduce(
        (sum, count) => sum + count,
        0,
      ),
    },
    coveragePercent: {
      organization: percentage(organizationMapped, total),
      primaryDomain: percentage(primaryDomainClassified, total),
      contentType: contentTypeCoverage,
    },
    counts: {
      organization: orderedCounts(organizationCounts),
      primaryDomain: orderedCounts(primaryDomainCounts),
      secondaryDomain: orderedCounts(secondaryDomainCounts),
      contentType: orderedCounts(contentTypeCounts),
      contentTypeRuleFamily: orderedCounts(contentTypeRuleFamilyCounts),
      contentTypeStatusByDomain: Object.fromEntries(
        Object.entries(contentTypeStatusByDomain).sort(([left], [right]) =>
          left.localeCompare(right, "en"),
        ),
      ),
      conflicts: orderedCounts(conflictCounts),
    },
    topUnmappedAccounts: topUnmappedAccounts.slice(0, 50),
    majorUnmappedAccounts: topUnmappedAccounts.filter(({ count }) => count >= 100),
    ...(comparison ? { comparison } : {}),
    unresolvedDiagnostics: {
      total: unresolvedArticles.length,
      digestAvailability: {
        available: unresolvedArticles.filter(({ digestAvailable }) => digestAvailable)
          .length,
        missing: unresolvedArticles.filter(({ digestAvailable }) => !digestAvailable)
          .length,
      },
      byAccount: diagnosticDistribution(
        unresolvedArticles,
        ({ account }) => account || "(empty account)",
      ),
      byPrimaryDomain: diagnosticDistribution(
        unresolvedArticles,
        ({ primaryDomain }) => primaryDomain ?? "(unmapped)",
      ),
      byAccountDomainDigest: diagnosticDistribution(
        unresolvedArticles,
        ({ account, primaryDomain, digestAvailable }) =>
          `${account || "(empty account)"}|${primaryDomain ?? "(unmapped)"}|${digestAvailable ? "available" : "missing"}`,
      ),
      representativeSampleSize: unresolvedSample.length,
    },
    reviewSample: {
      requested: options.sampleSize,
      generated: sample.length,
      strategy:
        "deterministic round-robin across organization, school/academy, domain, type/status, conflict and publication-date strata",
    },
    representativeExamples: {
      classified: results
        .filter(
          (article) =>
            article.primaryDomain !== undefined &&
            article.contentTypeStatus === "classified",
        )
        .sort(stableOrder)
        .slice(0, 10),
      ambiguous: results
        .filter((article) => article.conflicts.length > 0)
        .sort(stableOrder)
        .slice(0, 10),
      unresolved: results
        .filter(
          (article) =>
            article.primaryDomain === undefined ||
            article.contentTypeStatus === "unresolved",
        )
        .sort(stableOrder)
        .slice(0, 10),
    },
  };

  const reportPath = path.join(
    options.reportDirectory,
    `${options.runId}-report.json`,
  );
  const sampleJsonPath = path.join(
    options.reportDirectory,
    `${options.runId}-review-sample.json`,
  );
  const sampleCsvPath = path.join(
    options.reportDirectory,
    `${options.runId}-review-sample.csv`,
  );
  const unresolvedSampleJsonPath = path.join(
    options.reportDirectory,
    `${options.runId}-unresolved-sample.json`,
  );
  const unresolvedSampleCsvPath = path.join(
    options.reportDirectory,
    `${options.runId}-unresolved-sample.csv`,
  );
  await writeAtomically(reportPath, `${JSON.stringify(report, null, 2)}\n`);
  await writeAtomically(sampleJsonPath, `${JSON.stringify(sample, null, 2)}\n`);
  await writeAtomically(sampleCsvPath, sampleCsv(sample));
  await writeAtomically(
    unresolvedSampleJsonPath,
    `${JSON.stringify(unresolvedSample, null, 2)}\n`,
  );
  await writeAtomically(unresolvedSampleCsvPath, sampleCsv(unresolvedSample));

  console.log(`SAFE DRY RUN: ${total} metadata articles; no bodies or production classification files written.`);
  console.log(`Organization coverage: ${report.coveragePercent.organization}%`);
  console.log(`Primary-domain coverage: ${report.coveragePercent.primaryDomain}%`);
  console.log(`Content-type coverage: ${report.coveragePercent.contentType}%`);
  console.log(`Content-type ambiguous: ${contentTypeAmbiguous}`);
  console.log(`Report: ${reportPath}`);
  console.log(`Review CSV: ${sampleCsvPath}`);
  console.log(`Review JSON: ${sampleJsonPath}`);
  console.log(`Unresolved sample CSV: ${unresolvedSampleCsvPath}`);
  console.log(`Unresolved sample JSON: ${unresolvedSampleJsonPath}`);
  if (comparison) {
    console.log(
      `Before/after content-type coverage: ${comparison.before.coveragePercent}% -> ${comparison.after.coveragePercent}% (${comparison.delta.coveragePercentagePoints >= 0 ? "+" : ""}${comparison.delta.coveragePercentagePoints} pp)`,
    );
  }
  if (report.majorUnmappedAccounts.length > 0) {
    console.warn(
      `HUMAN CHECKPOINT: ${report.majorUnmappedAccounts.length} unmapped account(s) have at least 100 articles. See the report; no mappings were guessed.`,
    );
  }
}

main().catch((error) => {
  console.error(
    `Classification dry run failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
