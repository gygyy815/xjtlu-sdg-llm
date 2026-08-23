import type { ContentTypeKey } from "../classification/content-types";
import type { KnowledgeDomainKey } from "../classification/knowledge-domains";
import type { OrganizationUnitKey } from "../classification/organization-units";

export type DigestSource = "frontmatter" | "body_fallback" | "none";

export type ArticleSummary = {
  id: string;
  title: string;
  author?: string;
  account: string;
  publishedAt?: string;
  sourceUrl?: string;
  digest?: string;
  digestSource: DigestSource;
  relativePath: string;
  organizationUnit?: OrganizationUnitKey;
  primaryDomain?: KnowledgeDomainKey;
  secondaryDomains?: KnowledgeDomainKey[];
  contentType?: ContentTypeKey;
};

export type ArticleDetail = ArticleSummary & {
  content: string;
};

export type ArticleSummarySearchOptions = {
  q?: string;
  page?: number;
  pageSize?: number;
  knowledgeDomain?: string;
  organizationUnit?: string;
  contentType?: string;
};

export type ArticleSummarySearchResult = {
  items: ArticleSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
