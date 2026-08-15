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
};

export type ArticleDetail = ArticleSummary & {
  content: string;
};
