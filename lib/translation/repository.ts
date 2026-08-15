import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  TranslationBatchReport,
  TranslationRecord,
} from "./types";

function requiredString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Translation record has an invalid ${field}`);
  }
}

function safePathSegment(value: string, field: string) {
  if (
    !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(value) ||
    value === "." ||
    value === ".."
  ) {
    throw new Error(`${field} cannot be used as a storage path segment: ${value}`);
  }
  return value;
}

function isTranslationRecord(value: unknown): value is TranslationRecord {
  if (value === null || typeof value !== "object") return false;
  const record = value as Partial<TranslationRecord>;
  return (
    record.version === 1 &&
    typeof record.articleId === "string" &&
    typeof record.sourceLanguage === "string" &&
    typeof record.language === "string" &&
    typeof record.title === "string" &&
    (record.digest === undefined || typeof record.digest === "string") &&
    typeof record.content === "string" &&
    typeof record.translatedAt === "string" &&
    typeof record.provider === "string" &&
    typeof record.model === "string"
  );
}

async function writeJsonAtomically(destination: string, value: unknown) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
}

export function enrichmentRootFromEnvironment() {
  const configuredRoot = process.env.KB_ENRICHMENT_ROOT?.trim();
  if (!configuredRoot) {
    throw new Error(
      "KB_ENRICHMENT_ROOT is required to store translation enrichment",
    );
  }
  return path.resolve(configuredRoot);
}

export class FileSystemTranslationRepository {
  readonly root: string;

  constructor(root = enrichmentRootFromEnvironment()) {
    this.root = path.resolve(root);
  }

  translationPath(articleId: string, language: string) {
    return path.join(
      this.root,
      "translations",
      safePathSegment(language, "language"),
      `${safePathSegment(articleId, "articleId")}.json`,
    );
  }

  async get(articleId: string, language: string) {
    const sourcePath = this.translationPath(articleId, language);
    let parsed: unknown;

    try {
      parsed = JSON.parse(await readFile(sourcePath, "utf8"));
    } catch (error) {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return undefined;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not read translation at ${sourcePath}: ${message}`);
    }

    if (!isTranslationRecord(parsed)) {
      throw new Error(`Invalid translation record at ${sourcePath}`);
    }
    if (parsed.articleId !== articleId || parsed.language !== language) {
      throw new Error(
        `Translation identity does not match its storage path: ${sourcePath}`,
      );
    }
    return parsed;
  }

  async save(record: TranslationRecord) {
    requiredString(record.articleId, "articleId");
    requiredString(record.sourceLanguage, "sourceLanguage");
    requiredString(record.language, "language");
    requiredString(record.title, "title");
    requiredString(record.translatedAt, "translatedAt");
    requiredString(record.provider, "provider");
    requiredString(record.model, "model");
    if (record.version !== 1 || typeof record.content !== "string") {
      throw new Error("Translation record has an unsupported schema");
    }

    const destination = this.translationPath(record.articleId, record.language);
    await writeJsonAtomically(destination, record);
    return destination;
  }

  async saveReport(report: TranslationBatchReport) {
    const destination = path.join(
      this.root,
      "reports",
      "translations",
      `${safePathSegment(report.runId, "runId")}.json`,
    );
    await writeJsonAtomically(destination, report);
    return destination;
  }
}
