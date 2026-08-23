import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { isContentTypeKey } from "./content-types.ts";
import { isKnowledgeDomainKey } from "./knowledge-domains.ts";
import type {
  ArticleClassificationLookup,
  ArticleClassificationRecord,
  ArticleOrganisation,
  UnvalidatedArticleClassificationRecord,
} from "./types";

const EMPTY_CLASSIFICATION: Readonly<ArticleClassificationLookup> = Object.freeze({
  secondaryDomains: Object.freeze([]),
});

function hasOnlyUniqueNonEmptyStrings(value: unknown): value is string[] {
  return (
    Array.isArray(value) &&
    value.every(
      (item) =>
        typeof item === "string" && item.trim() === item && item.length > 0,
    ) &&
    new Set(value).size === value.length
  );
}

function isStableKey(value: unknown): value is string {
  return (
    typeof value === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._:-]*$/.test(value)
  );
}

function isClassificationMethod(value: unknown) {
  return value === "manual" || value === "rule" || value === "llm";
}

export function isArticleClassificationRecord(
  value: unknown,
): value is UnvalidatedArticleClassificationRecord {
  if (value === null || typeof value !== "object") return false;
  const record = value as Partial<UnvalidatedArticleClassificationRecord>;
  const classification = record.classification;
  return (
    record.version === 1 &&
    typeof record.articleId === "string" &&
    /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(record.articleId) &&
    (record.primaryDomain === undefined || isStableKey(record.primaryDomain)) &&
    hasOnlyUniqueNonEmptyStrings(record.secondaryDomains) &&
    record.secondaryDomains.length <= 1 &&
    (record.contentType === undefined || isStableKey(record.contentType)) &&
    (record.primaryDomain !== undefined ||
      record.secondaryDomains.length > 0 ||
      record.contentType !== undefined) &&
    (record.secondaryDomains.length === 0 || record.primaryDomain !== undefined) &&
    !record.secondaryDomains.includes(record.primaryDomain ?? "") &&
    typeof record.classifiedAt === "string" &&
    Number.isFinite(Date.parse(record.classifiedAt)) &&
    classification !== null &&
    typeof classification === "object" &&
    isClassificationMethod(classification.method) &&
    typeof classification.version === "string" &&
    classification.version.trim() === classification.version &&
    classification.version.length > 0
  );
}

export function classificationRegistryErrors(
  record: UnvalidatedArticleClassificationRecord,
) {
  const unknownDomains = [
    record.primaryDomain,
    ...record.secondaryDomains,
  ].filter(
    (domain): domain is string =>
      typeof domain === "string" && !isKnowledgeDomainKey(domain),
  );
  const errors: string[] = [];
  if (unknownDomains.length > 0) {
    errors.push(`unknown knowledge domain(s): ${unknownDomains.join(", ")}`);
  }
  if (record.contentType !== undefined && !isContentTypeKey(record.contentType)) {
    errors.push(`unknown content type: ${record.contentType}`);
  }
  return errors;
}

export function isApprovedArticleClassificationRecord(
  value: unknown,
): value is ArticleClassificationRecord {
  return (
    isArticleClassificationRecord(value) &&
    classificationRegistryErrors(value).length === 0
  );
}

export function isArticleOrganisation(
  value: unknown,
): value is ArticleOrganisation {
  if (value === null || typeof value !== "object") return false;
  const organisation = value as Partial<ArticleOrganisation>;
  return (
    (organisation.primaryDomain === undefined ||
      isKnowledgeDomainKey(organisation.primaryDomain)) &&
    hasOnlyUniqueNonEmptyStrings(organisation.secondaryDomains) &&
    organisation.secondaryDomains.length <= 1 &&
    organisation.secondaryDomains.every(isKnowledgeDomainKey) &&
    (organisation.contentType === undefined ||
      isContentTypeKey(organisation.contentType)) &&
    (organisation.primaryDomain !== undefined ||
      organisation.secondaryDomains.length > 0 ||
      organisation.contentType !== undefined) &&
    (organisation.secondaryDomains.length === 0 ||
      organisation.primaryDomain !== undefined) &&
    !organisation.secondaryDomains.includes(organisation.primaryDomain as never)
  );
}

function safeArticleId(articleId: string) {
  if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(articleId)) {
    throw new Error(`Invalid classification articleId: ${articleId}`);
  }
  return articleId;
}

async function writeJsonAtomically(destination: string, value: unknown) {
  await mkdir(path.dirname(destination), { recursive: true });
  const temporary = `${destination}.tmp-${process.pid}-${Date.now()}`;
  await writeFile(temporary, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporary, destination);
}

export function optionalEnrichmentRootFromEnvironment() {
  const configuredRoot = process.env.KB_ENRICHMENT_ROOT?.trim();
  return configuredRoot ? path.resolve(configuredRoot) : undefined;
}

function enrichmentRootFromEnvironment() {
  const root = optionalEnrichmentRootFromEnvironment();
  if (!root) {
    throw new Error(
      "KB_ENRICHMENT_ROOT is required to store classification enrichment",
    );
  }
  return root;
}

export class FileSystemClassificationRepository {
  readonly root: string;

  constructor(root = enrichmentRootFromEnvironment()) {
    this.root = path.resolve(root);
  }

  classificationPath(articleId: string) {
    return path.join(
      this.root,
      "classification",
      `${safeArticleId(articleId)}.json`,
    );
  }

  async get(articleId: string) {
    const sourcePath = this.classificationPath(articleId);
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
      throw new Error(
        `Could not read classification at ${sourcePath}: ${message}`,
      );
    }

    if (
      !isApprovedArticleClassificationRecord(parsed)
    ) {
      throw new Error(`Invalid classification record at ${sourcePath}`);
    }
    if (parsed.articleId !== articleId) {
      throw new Error(
        `Classification identity does not match its storage path: ${sourcePath}`,
      );
    }
    return parsed;
  }

  async save(record: ArticleClassificationRecord) {
    if (
      !isApprovedArticleClassificationRecord(record)
    ) {
      throw new Error("Classification record has an unsupported schema");
    }
    const destination = this.classificationPath(record.articleId);
    await writeJsonAtomically(destination, record);
    return destination;
  }
}

export class ClassificationIndexRepository {
  readonly sourcePath?: string;
  private indexPromise?: Promise<ReadonlyMap<string, ArticleOrganisation>>;

  constructor(sourcePath?: string) {
    this.sourcePath = sourcePath ? path.resolve(sourcePath) : undefined;
  }

  load() {
    this.indexPromise ??= this.read();
    return this.indexPromise;
  }

  async get(
    articleId: string,
  ): Promise<Readonly<ArticleClassificationLookup>> {
    return (await this.load()).get(articleId) ?? EMPTY_CLASSIFICATION;
  }

  private async read(): Promise<ReadonlyMap<string, ArticleOrganisation>> {
    if (!this.sourcePath) return new Map();

    let parsed: unknown;
    try {
      parsed = JSON.parse(await readFile(this.sourcePath, "utf8"));
    } catch (error) {
      if (
        error !== null &&
        typeof error === "object" &&
        "code" in error &&
        error.code === "ENOENT"
      ) {
        return new Map();
      }
      console.warn(
        `Ignoring unreadable classification index at ${this.sourcePath}`,
      );
      return new Map();
    }

    if (
      parsed === null ||
      typeof parsed !== "object" ||
      (parsed as { version?: unknown }).version !== 1 ||
      (parsed as { articles?: unknown }).articles === null ||
      typeof (parsed as { articles?: unknown }).articles !== "object" ||
      Array.isArray((parsed as { articles?: unknown }).articles)
    ) {
      console.warn(`Ignoring malformed classification index at ${this.sourcePath}`);
      return new Map();
    }

    const articles = (parsed as { articles: Record<string, unknown> }).articles;
    const index = new Map<string, ArticleOrganisation>();
    for (const articleId of Object.keys(articles).sort((left, right) =>
      left.localeCompare(right, "en"),
    )) {
      const organisation = articles[articleId];
      if (
        !/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(articleId) ||
        !isArticleOrganisation(organisation)
      ) {
        console.warn(
          `Ignoring malformed classification index entry for ${articleId}`,
        );
        continue;
      }
      index.set(articleId, {
        ...(organisation.primaryDomain
          ? { primaryDomain: organisation.primaryDomain }
          : {}),
        secondaryDomains: [...organisation.secondaryDomains],
        ...(organisation.contentType
          ? { contentType: organisation.contentType }
          : {}),
      });
    }
    return index;
  }
}

function defaultClassificationIndexPath() {
  const root = optionalEnrichmentRootFromEnvironment();
  return root ? path.join(root, "classification", "index.json") : undefined;
}

const defaultIndexRepository = new ClassificationIndexRepository(
  defaultClassificationIndexPath(),
);

/** Load the compact runtime index once per module instance. */
export function loadClassificationIndex() {
  return defaultIndexRepository.load();
}

export function getArticleClassification(articleId: string) {
  return defaultIndexRepository.get(articleId);
}
