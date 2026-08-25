import type { ContentTypeKey } from "./content-types";
import type { KnowledgeDomainKey } from "./knowledge-domains";
import type { OrganizationUnitKey } from "./organization-units";

export type ClassificationMethod = "manual" | "rule" | "llm";

export type ArticleClassificationRecord = {
  version: 1;
  articleId: string;
  primaryDomain?: KnowledgeDomainKey;
  secondaryDomains: KnowledgeDomainKey[];
  contentType?: ContentTypeKey;
  classifiedAt: string;
  classification: {
    method: ClassificationMethod;
    version: string;
  };
};

export type UnvalidatedArticleClassificationRecord = Omit<
  ArticleClassificationRecord,
  "primaryDomain" | "secondaryDomains" | "contentType"
> & {
  primaryDomain?: string;
  secondaryDomains: string[];
  contentType?: string;
};

export type ArticleOrganisation = Pick<
  ArticleClassificationRecord,
  "primaryDomain" | "secondaryDomains" | "contentType"
> & {
  organizationUnit?: OrganizationUnitKey;
};

export type ArticleClassificationLookup = {
  organizationUnit?: OrganizationUnitKey;
  primaryDomain?: KnowledgeDomainKey;
  secondaryDomains: readonly KnowledgeDomainKey[];
  contentType?: ContentTypeKey;
};

export type ClassificationConfidence = "high" | "medium" | "low";

export type ProductionArticleClassification = {
  organization: string[];
  knowledgeDomains: string[];
  contentTypes: ContentTypeKey[];
  confidence: {
    organization: ClassificationConfidence;
    domain: ClassificationConfidence;
    contentType: ClassificationConfidence;
  };
  classification: {
    method: "rule";
    version: "v3";
  };
  classificationStatus?: "ambiguous";
};

export type ProductionClassificationIndex = {
  version: 1;
  generatedAt: string;
  classifierVersion: "taxonomy-v3-semantic-templates";
  articles: Record<string, ProductionArticleClassification>;
};

export type ClassificationIndex = {
  version: 1;
  articles: Record<string, ArticleOrganisation>;
};

export type ClassificationIndexBuildReport = {
  version: 1;
  scanned: number;
  indexed: number;
  malformed: Array<{ file: string; error: string }>;
  duplicates: Array<{
    articleId: string;
    keptFile: string;
    ignoredFile: string;
  }>;
};
