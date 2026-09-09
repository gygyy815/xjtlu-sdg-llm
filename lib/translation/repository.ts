import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import type {
  TranslationBatchReport,
  TranslationCheckpoint,
  TranslationRecord,
  TranslationRecordV2,
} from "./types";

function requiredString(value: unknown, field: string): asserts value is string {
  if (typeof value !== "string" || !value.trim()) {
    throw new Error(`Translation record has an invalid ${field}`);
  }
}

function isQualityMetadata(value: unknown) {
  if (value === undefined) return true;
  if (value === null || typeof value !== "object") return false;
  const qa = value as Record<string, unknown>;
  return qa.status === "passed" &&
    typeof qa.processingVersion === "string" && qa.processingVersion.length > 0 &&
    typeof qa.validationVersion === "string" && qa.validationVersion.length > 0 &&
    typeof qa.sourceViewVersion === "string" && qa.sourceViewVersion.length > 0 &&
    typeof qa.validatedAt === "string" && qa.validatedAt.length > 0;
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

export function isTranslationRecord(value: unknown): value is TranslationRecord {
  if (value === null || typeof value !== "object") return false;
  const record = value as Record<string, unknown>;
  return (
    (record.version === 1 || record.version === 2) &&
    typeof record.articleId === "string" &&
    (record.version === 1 ||
      (typeof record.sourceHash === "string" &&
        /^[a-f0-9]{64}$/.test(record.sourceHash))) &&
    typeof record.sourceLanguage === "string" &&
    typeof record.language === "string" &&
    typeof record.title === "string" &&
    (record.version === 1 ||
      record.summary === undefined ||
      typeof record.summary === "string") &&
    (record.digest === undefined || typeof record.digest === "string") &&
    isQualityMetadata(record.qa) &&
    typeof record.content === "string" &&
    typeof record.translatedAt === "string" &&
    typeof record.provider === "string" &&
    typeof record.model === "string"
  );
}

export function validateTranslationRecordV2(value: unknown): asserts value is TranslationRecordV2 {
  if (
    !isTranslationRecord(value) ||
    value.version !== 2 ||
    !/^[a-f0-9]{64}$/.test(value.sourceHash) ||
    typeof value.content !== "string" ||
    (value.summary !== undefined && typeof value.summary !== "string") ||
    (value.digest !== undefined && typeof value.digest !== "string") ||
    (value.summary !== undefined && value.digest !== undefined)
  ) {
    throw new Error("Translation record has an unsupported TranslationRecordV2 schema");
  }
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

  checkpointPath(articleId: string, language: string) {
    return path.join(this.root, "translation-checkpoints", safePathSegment(language, "language"), `${safePathSegment(articleId, "articleId")}.json`);
  }

  async getCheckpoint(articleId: string, language: string) {
    try {
      const parsed = JSON.parse(await readFile(this.checkpointPath(articleId, language), "utf8")) as TranslationCheckpoint;
      if (parsed?.version !== 1 || parsed.articleId !== articleId || parsed.targetLanguage !== language || !parsed.segments || typeof parsed.segments !== "object") return undefined;
      return parsed;
    } catch (error) {
      if (error && typeof error === "object" && "code" in error && error.code === "ENOENT") return undefined;
      if (error instanceof SyntaxError) return undefined;
      throw error;
    }
  }

  async saveCheckpoint(checkpoint: TranslationCheckpoint) {
    const destination = this.checkpointPath(checkpoint.articleId, checkpoint.targetLanguage);
    await writeJsonAtomically(destination, checkpoint);
    return destination;
  }

  async clearCheckpoint(articleId: string, language: string) {
    const destination = this.checkpointPath(articleId, language);
    const { rm } = await import("node:fs/promises");
    await rm(destination, { force: true });
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
      if (error instanceof SyntaxError) {
        console.warn(`[translation-cache] ignoring malformed JSON: ${sourcePath}`);
        return undefined;
      }
      const message = error instanceof Error ? error.message : String(error);
      throw new Error(`Could not read translation at ${sourcePath}: ${message}`);
    }

    if (!isTranslationRecord(parsed)) {
      console.warn(`[translation-cache] ignoring invalid record: ${sourcePath}`);
      return undefined;
    }
    if (parsed.articleId !== articleId || parsed.language !== language) {
      console.warn(`[translation-cache] ignoring record with mismatched identity: ${sourcePath}`);
      return undefined;
    }
    return parsed;
  }

  /** Read a pre-generated English enrichment without invoking translation. */
  async getEnglishTranslationByArticleId(articleId: string) {
    return this.get(articleId, "en");
  }

  async save(record: TranslationRecordV2) {
    requiredString(record.articleId, "articleId");
    requiredString(record.sourceLanguage, "sourceLanguage");
    requiredString(record.language, "language");
    requiredString(record.title, "title");
    requiredString(record.translatedAt, "translatedAt");
    requiredString(record.provider, "provider");
    requiredString(record.model, "model");
    validateTranslationRecordV2(record);

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
