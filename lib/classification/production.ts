import type { ArticleSummary } from "../knowledge-base/types";
import {
  CONTENT_TYPE_DEFINITIONS,
  isContentTypeKey,
  type ContentTypeKey,
} from "./content-types.ts";
import {
  KNOWLEDGE_DOMAIN_DEFINITIONS,
  type KnowledgeDomainKey,
} from "./knowledge-domains.ts";
import {
  ORGANIZATION_UNIT_DEFINITIONS,
  type OrganizationUnitKey,
} from "./organization-units.ts";
import {
  CLASSIFICATION_RULE_VERSION,
  classifyArticleMetadata,
} from "./rules.ts";
import type {
  ProductionArticleClassification,
  ProductionClassificationIndex,
} from "./types.ts";

export const PRODUCTION_CLASSIFIER_VERSION =
  "taxonomy-v3-semantic-templates" as const;
export const PRODUCTION_CLASSIFICATION_VERSION = "v3" as const;

if (CLASSIFICATION_RULE_VERSION !== PRODUCTION_CLASSIFIER_VERSION) {
  throw new Error(
    `Production classifier requires ${PRODUCTION_CLASSIFIER_VERSION}; found ${CLASSIFICATION_RULE_VERSION}`,
  );
}

const ORGANIZATION_LABEL_BY_KEY = new Map<OrganizationUnitKey, string>(
  ORGANIZATION_UNIT_DEFINITIONS.map(({ key, labelEn }) => [key, labelEn]),
);
const ORGANIZATION_KEY_BY_LABEL = new Map<string, OrganizationUnitKey>(
  ORGANIZATION_UNIT_DEFINITIONS.map(({ key, labelEn }) => [labelEn, key]),
);
const DOMAIN_LABEL_BY_KEY = new Map<KnowledgeDomainKey, string>(
  KNOWLEDGE_DOMAIN_DEFINITIONS.map(({ key, labelEn }) => [key, labelEn]),
);
const DOMAIN_KEY_BY_LABEL = new Map<string, KnowledgeDomainKey>(
  KNOWLEDGE_DOMAIN_DEFINITIONS.map(({ key, labelEn }) => [labelEn, key]),
);
const CONTENT_TYPE_KEYS = new Set<string>(
  CONTENT_TYPE_DEFINITIONS.map(({ key }) => key),
);

export type ProductionMetadataArticle = Pick<
  ArticleSummary,
  "id" | "title" | "account" | "digest"
>;

function unique<T>(values: readonly T[]) {
  return [...new Set(values)];
}

function organizationLabel(key: OrganizationUnitKey) {
  const label = ORGANIZATION_LABEL_BY_KEY.get(key);
  if (!label) throw new Error(`Unknown organization key: ${key}`);
  return label;
}

function domainLabel(key: KnowledgeDomainKey) {
  const label = DOMAIN_LABEL_BY_KEY.get(key);
  if (!label) throw new Error(`Unknown knowledge domain key: ${key}`);
  return label;
}

export function organizationKeyForProductionLabel(label: string) {
  return ORGANIZATION_KEY_BY_LABEL.get(label);
}

export function domainKeyForProductionLabel(label: string) {
  return DOMAIN_KEY_BY_LABEL.get(label);
}

export function buildProductionClassificationIndex(
  metadata: readonly ProductionMetadataArticle[],
  generatedAt = new Date().toISOString(),
) {
  if (!Number.isFinite(Date.parse(generatedAt))) {
    throw new Error(`Invalid generatedAt: ${generatedAt}`);
  }

  const articles = new Map<string, ProductionArticleClassification>();
  let classifiedDomainCount = 0;
  let classifiedContentTypeCount = 0;
  let ambiguousCount = 0;
  let unresolvedCount = 0;

  for (const article of metadata) {
    if (!/^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(article.id)) {
      throw new Error(`Invalid article id: ${article.id}`);
    }
    if (articles.has(article.id)) {
      throw new Error(`Duplicate article id: ${article.id}`);
    }

    const result = classifyArticleMetadata(article);
    const organization = result.organizationUnit
      ? [organizationLabel(result.organizationUnit)]
      : [];
    // Routing invariant: preserve classifier priority. The primary domain is
    // serialized first and secondary domains follow in classifier order.
    const knowledgeDomains = unique(
      [result.primaryDomain, ...result.secondaryDomains]
        .filter((domain): domain is KnowledgeDomainKey => domain !== undefined)
        .map(domainLabel),
    );
    const contentTypes: ContentTypeKey[] = result.contentType
      ? [result.contentType]
      : [];

    if (knowledgeDomains.length > 0) classifiedDomainCount += 1;
    if (contentTypes.length > 0) classifiedContentTypeCount += 1;
    if (result.contentTypeStatus === "ambiguous") ambiguousCount += 1;
    if (result.contentTypeStatus === "unresolved") unresolvedCount += 1;

    articles.set(article.id, {
      organization,
      knowledgeDomains,
      contentTypes,
      confidence: {
        organization: organization.length > 0 ? "high" : "low",
        domain: knowledgeDomains.length > 0 ? "high" : "low",
        contentType: contentTypes.length > 0 ? "medium" : "low",
      },
      classification: {
        method: "rule",
        version: PRODUCTION_CLASSIFICATION_VERSION,
      },
      ...(result.contentTypeStatus === "ambiguous"
        ? { classificationStatus: "ambiguous" as const }
        : {}),
    });
  }

  const index: ProductionClassificationIndex = {
    version: 1,
    generatedAt,
    classifierVersion: PRODUCTION_CLASSIFIER_VERSION,
    articles: Object.fromEntries(
      [...articles.entries()].sort(([left], [right]) =>
        left.localeCompare(right, "en"),
      ),
    ),
  };

  return {
    index,
    totals: {
      totalArticles: metadata.length,
      classifiedDomainCount,
      classifiedContentTypeCount,
      ambiguousCount,
      unresolvedCount,
    },
  };
}

function hasUniqueKnownStrings(
  value: unknown,
  knownValues: ReadonlySet<string>,
  maximumLength: number,
) {
  return (
    Array.isArray(value) &&
    value.length <= maximumLength &&
    value.every(
      (item) =>
        typeof item === "string" &&
        knownValues.has(item) &&
        item.trim() === item,
    ) &&
    new Set(value).size === value.length
  );
}

const ORGANIZATION_LABELS = new Set(ORGANIZATION_KEY_BY_LABEL.keys());
const DOMAIN_LABELS = new Set(DOMAIN_KEY_BY_LABEL.keys());
const CONFIDENCE_LEVELS = new Set(["high", "medium", "low"]);

export function isProductionArticleClassification(
  value: unknown,
): value is ProductionArticleClassification {
  if (value === null || typeof value !== "object") return false;
  const article = value as Partial<ProductionArticleClassification>;
  const confidence = article.confidence;
  const classification = article.classification;
  const contentTypes = article.contentTypes;
  if (
    !hasUniqueKnownStrings(article.organization, ORGANIZATION_LABELS, 1) ||
    !hasUniqueKnownStrings(article.knowledgeDomains, DOMAIN_LABELS, 2) ||
    !hasUniqueKnownStrings(contentTypes, CONTENT_TYPE_KEYS, 1) ||
    confidence === null ||
    typeof confidence !== "object" ||
    !CONFIDENCE_LEVELS.has(confidence.organization ?? "") ||
    !CONFIDENCE_LEVELS.has(confidence.domain ?? "") ||
    !CONFIDENCE_LEVELS.has(confidence.contentType ?? "") ||
    classification === null ||
    typeof classification !== "object" ||
    classification.method !== "rule" ||
    classification.version !== PRODUCTION_CLASSIFICATION_VERSION ||
    (article.classificationStatus !== undefined &&
      article.classificationStatus !== "ambiguous")
  ) {
    return false;
  }

  if (
    article.classificationStatus === "ambiguous" &&
    contentTypes!.length !== 0
  ) {
    return false;
  }
  return contentTypes!.every(isContentTypeKey);
}

export function isProductionClassificationIndex(
  value: unknown,
): value is ProductionClassificationIndex {
  if (value === null || typeof value !== "object") return false;
  const index = value as Partial<ProductionClassificationIndex>;
  if (
    index.version !== 1 ||
    typeof index.generatedAt !== "string" ||
    !Number.isFinite(Date.parse(index.generatedAt)) ||
    index.classifierVersion !== PRODUCTION_CLASSIFIER_VERSION ||
    index.articles === null ||
    typeof index.articles !== "object" ||
    Array.isArray(index.articles)
  ) {
    return false;
  }
  return Object.entries(index.articles).every(
    ([articleId, classification]) =>
      /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(articleId) &&
      isProductionArticleClassification(classification),
  );
}
