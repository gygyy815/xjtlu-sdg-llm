import { CONTENT_TYPE_DEFINITIONS } from "./content-types.ts";
import {
  KNOWLEDGE_DOMAIN_DEFINITIONS,
  type KnowledgeDomainKey,
} from "./knowledge-domains.ts";
import {
  ORGANIZATION_UNIT_DEFINITIONS,
  type OrganizationUnitKey,
} from "./organization-units.ts";
import type {
  ProductionArticleClassification,
  ProductionClassificationIndex,
} from "./types.ts";

const DOMAIN_KEY_BY_LABEL = new Map<string, KnowledgeDomainKey>(
  KNOWLEDGE_DOMAIN_DEFINITIONS.map(({ key, labelEn }) => [labelEn, key]),
);
const ORGANIZATION_KEY_BY_LABEL = new Map<string, OrganizationUnitKey>(
  ORGANIZATION_UNIT_DEFINITIONS.map(({ key, labelEn }) => [labelEn, key]),
);
const CONTENT_TYPE_KEYS = new Set<string>(
  CONTENT_TYPE_DEFINITIONS.map(({ key }) => key),
);
const CONFIDENCE_LEVELS = new Set(["high", "medium", "low"]);

export function domainKeyForProductionLabel(label: string) {
  return DOMAIN_KEY_BY_LABEL.get(label);
}

export function organizationKeyForProductionLabel(label: string) {
  return ORGANIZATION_KEY_BY_LABEL.get(label);
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

const DOMAIN_LABELS = new Set(DOMAIN_KEY_BY_LABEL.keys());
const ORGANIZATION_LABELS = new Set(ORGANIZATION_KEY_BY_LABEL.keys());

function isProductionArticleClassification(
  value: unknown,
): value is ProductionArticleClassification {
  if (value === null || typeof value !== "object") return false;
  const article = value as Partial<ProductionArticleClassification>;
  const confidence = article.confidence;
  const classification = article.classification;
  if (
    !hasUniqueKnownStrings(article.organization, ORGANIZATION_LABELS, 1) ||
    !hasUniqueKnownStrings(article.knowledgeDomains, DOMAIN_LABELS, 2) ||
    !hasUniqueKnownStrings(article.contentTypes, CONTENT_TYPE_KEYS, 1) ||
    confidence === null ||
    typeof confidence !== "object" ||
    !CONFIDENCE_LEVELS.has(confidence.organization ?? "") ||
    !CONFIDENCE_LEVELS.has(confidence.domain ?? "") ||
    !CONFIDENCE_LEVELS.has(confidence.contentType ?? "") ||
    classification === null ||
    typeof classification !== "object" ||
    classification.method !== "rule" ||
    classification.version !== "v3" ||
    (article.classificationStatus !== undefined &&
      article.classificationStatus !== "ambiguous")
  ) {
    return false;
  }
  return !(
    article.classificationStatus === "ambiguous" &&
    article.contentTypes!.length !== 0
  );
}

export function isProductionClassificationIndex(
  value: unknown,
): value is ProductionClassificationIndex {
  if (value === null || typeof value !== "object") return false;
  const index = value as Partial<ProductionClassificationIndex>;
  return (
    index.version === 1 &&
    typeof index.generatedAt === "string" &&
    Number.isFinite(Date.parse(index.generatedAt)) &&
    index.classifierVersion === "taxonomy-v3-semantic-templates" &&
    index.articles !== null &&
    typeof index.articles === "object" &&
    !Array.isArray(index.articles) &&
    Object.entries(index.articles).every(
      ([articleId, classification]) =>
        /^[A-Za-z0-9][A-Za-z0-9._-]*$/.test(articleId) &&
        isProductionArticleClassification(classification),
    )
  );
}
