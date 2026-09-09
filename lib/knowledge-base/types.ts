import type { ContentTypeKey } from "../classification/content-types";
import type { KnowledgeDomainKey } from "../classification/knowledge-domains";
import type { OrganizationUnitKey } from "../classification/organization-units";
import type { ArticleSort, ArticleTimeRange } from "../article-center-query";

export type DigestSource = "frontmatter" | "body_fallback" | "none";

export type ArticleDateSource =
  | "frontmatter"
  | "export_metadata"
  | "canonical_metadata"
  | "filename_convention"
  | "title_prefix"
  | "unknown";

export type ArticleDateConfidence = "high" | "medium" | "low" | "unknown";

export type SdgTag = {
  code: string;
  level?: string;
  tag: string;
  url: string;
  reason?: string;
};

export type ArticleSummary = {
  id: string;
  title: string;
  author?: string;
  account: string;
  publishedAt?: string;
  publishedAtSource?: ArticleDateSource;
  publishedAtConfidence?: ArticleDateConfidence;
  sourceUrl?: string;
  digest?: string;
  summary?: string;
  sdgTags?: SdgTag[];
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
  sourceAccount?: string;
  contentType?: string;
  sdgGoal?: string;
  timeRange?: ArticleTimeRange;
  sort?: ArticleSort;
  publicationYears?: readonly string[];
  /** Test/diagnostic override; the UI leaves this unset and uses campus time. */
  now?: string;
};

export type ArticleSummarySearchResult = {
  items: ArticleSummary[];
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
};
