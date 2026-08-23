import { readdir, readFile, mkdir, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import {
  classificationRegistryErrors,
  isApprovedArticleClassificationRecord,
  isArticleClassificationRecord,
  optionalEnrichmentRootFromEnvironment,
} from "../lib/classification/repository.ts";
import type {
  ArticleOrganisation,
  ClassificationIndexBuildReport,
} from "../lib/classification/types.ts";

async function writeJsonAtomically(destination: string, value: unknown) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
}

async function main() {
  const root = optionalEnrichmentRootFromEnvironment();
  if (!root) {
    throw new Error(
      "KB_ENRICHMENT_ROOT is required to build the classification index",
    );
  }

  const classificationDirectory = path.join(root, "classification");
  await mkdir(classificationDirectory, { recursive: true });
  const files = (await readdir(classificationDirectory, { withFileTypes: true }))
    .filter(
      (entry) =>
        entry.isFile() &&
        entry.name.endsWith(".json") &&
        entry.name !== "index.json",
    )
    .map((entry) => entry.name)
    .sort((left, right) => left.localeCompare(right, "en"));

  const report: ClassificationIndexBuildReport = {
    version: 1,
    scanned: files.length,
    indexed: 0,
    malformed: [],
    duplicates: [],
  };
  const articles = new Map<
    string,
    { file: string; value: ArticleOrganisation }
  >();

  for (const file of files) {
    const sourcePath = path.join(classificationDirectory, file);
    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(sourcePath, "utf8"));
    } catch (error) {
      report.malformed.push({
        file,
        error: error instanceof Error ? error.message : String(error),
      });
      continue;
    }

    if (!isArticleClassificationRecord(parsed)) {
      report.malformed.push({ file, error: "unsupported classification schema" });
      continue;
    }

    const registryErrors = classificationRegistryErrors(parsed);
    if (registryErrors.length > 0) {
      report.malformed.push({ file, error: registryErrors.join("; ") });
      continue;
    }
    if (!isApprovedArticleClassificationRecord(parsed)) continue;

    const previous = articles.get(parsed.articleId);
    if (previous) {
      report.duplicates.push({
        articleId: parsed.articleId,
        keptFile: previous.file,
        ignoredFile: file,
      });
      continue;
    }
    articles.set(parsed.articleId, {
      file,
      value: {
        ...(parsed.primaryDomain
          ? { primaryDomain: parsed.primaryDomain }
          : {}),
        secondaryDomains: [...parsed.secondaryDomains],
        ...(parsed.contentType ? { contentType: parsed.contentType } : {}),
      },
    });
  }

  const orderedArticles = Object.fromEntries(
    [...articles.entries()]
      .sort(([left], [right]) => left.localeCompare(right, "en"))
      .map(([articleId, entry]) => [articleId, entry.value]),
  );
  report.indexed = articles.size;

  await writeJsonAtomically(path.join(classificationDirectory, "index.json"), {
    version: 1,
    articles: orderedArticles,
  });
  await writeJsonAtomically(
    path.join(root, "reports", "classification", "index-build.json"),
    report,
  );

  console.log(
    `Classification index: ${report.indexed} indexed; ${report.malformed.length} malformed; ${report.duplicates.length} duplicate`,
  );
}

main().catch((error) => {
  console.error(
    `Classification index build failed: ${error instanceof Error ? error.message : String(error)}`,
  );
  process.exitCode = 1;
});
