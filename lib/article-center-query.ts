export type ArticleCenterQuery = {
  q?: string;
  knowledgeDomain?: string;
  organizationUnit?: string;
  contentType?: string;
  page?: number;
};

export function firstSearchParam(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

export function parseArticleCenterPage(value: string | undefined) {
  if (!value || !/^\d+$/.test(value)) return 1;
  const page = Number(value);
  return Number.isSafeInteger(page) && page > 0 ? page : 1;
}

export function resolveKnowledgeDomainParam(
  domain: string | string[] | undefined,
  legacyKb: string | string[] | undefined,
) {
  return firstSearchParam(domain) ?? firstSearchParam(legacyKb);
}

export function articleCenterHref({
  q = "",
  knowledgeDomain = "",
  organizationUnit = "",
  contentType = "",
  page = 1,
}: ArticleCenterQuery) {
  const params = new URLSearchParams();
  if (q) params.set("q", q);
  if (knowledgeDomain) params.set("domain", knowledgeDomain);
  if (organizationUnit) params.set("org", organizationUnit);
  if (contentType) params.set("type", contentType);
  if (page > 1) params.set("page", String(page));
  const query = params.toString();
  return query ? `/articles?${query}` : "/articles";
}
