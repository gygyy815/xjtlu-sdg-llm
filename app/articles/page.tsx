import Link from "next/link";
import {
  formatArticlePublishedAt,
  normalizeDisplayTitle,
} from "@/lib/article-presentation";
import {
  articleCenterHref,
  ARTICLE_YEARS,
  firstSearchParam,
  parseArticleCenterPage,
  resolveKnowledgeDomainParam,
  resolveArticleSortParam,
  resolveArticleYearParams,
  resolveArticleTimeRangeParam,
  resolveSdgGoalParam,
} from "@/lib/article-center-query";
import { contentTypeCatalog } from "@/lib/classification/content-types";
import { knowledgeDomainCatalog } from "@/lib/classification/knowledge-domains";
import { sourceAccountCatalog } from "@/lib/classification/organization-units";
import { searchArticleSummaries } from "@/lib/knowledge-base/repository";
import {
  formatSdgCode,
  SDG_GOALS,
  visibleArticleSdgTags,
} from "@/lib/knowledge-base/sdg-goals";

const PAGE_SIZE = 18;
const DIGEST_MAX_LENGTH = 180;

type ArticlesPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    domain?: string | string[];
    kb?: string | string[];
    org?: string | string[];
    type?: string | string[];
    sdg?: string | string[];
    time?: string | string[];
    sort?: string | string[];
    year?: string | string[];
    page?: string | string[];
    lang?: string | string[];
  }>;
};

function visiblePages(page: number, totalPages: number) {
  const candidates = new Set([1, totalPages, page - 1, page, page + 1]);
  return [...candidates]
    .filter((candidate) => candidate >= 1 && candidate <= totalPages)
    .sort((left, right) => left - right);
}

function truncateDigest(summary: string | undefined, english = false) {
  const normalized = summary?.replace(/\s+/g, " ").trim();
  if (!normalized) {
    return english
      ? "No summary is available. Open the article to read more."
      : "暂无摘要，可进入详情阅读全文。";
  }
  if (normalized.length <= DIGEST_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, DIGEST_MAX_LENGTH - 1).trimEnd()}…`;
}

function selectedYearLabel(years: readonly string[], english: boolean) {
  if (years.length === 0) return english ? "All years" : "全部年份";
  if (years.length === ARTICLE_YEARS.length) return english ? "All years" : "全部年份";
  return years.join(english ? ", " : "、");
}

export default async function ArticlesPage({ searchParams }: ArticlesPageProps) {
  const params = await searchParams;
  const english = firstSearchParam(params.lang) === "en";
  const language = english ? "en" : "zh";
  const q = firstSearchParam(params.q)?.trim() ?? "";
  const knowledgeDomain =
    resolveKnowledgeDomainParam(params.domain, params.kb)?.trim() ?? "";
  const contentType = firstSearchParam(params.type)?.trim() ?? "";
  const sourceAccount = firstSearchParam(params.org)?.trim() ?? "";
  const sdgGoal = resolveSdgGoalParam(params.sdg);
  const timeRange = resolveArticleTimeRangeParam(params.time);
  const publicationYears = resolveArticleYearParams(params.year);
  const sort = resolveArticleSortParam(params.sort);
  const requestedPage = parseArticleCenterPage(firstSearchParam(params.page));
  const knowledgeDomains = knowledgeDomainCatalog();
  const contentTypes = contentTypeCatalog();
  const sourceAccounts = sourceAccountCatalog();
  const knowledgeDomainLabels = new Map(
    knowledgeDomains.map(({ key, labelEn }) => [key, labelEn]),
  );
  const contentTypeLabels = new Map(
    contentTypes.map(({ key, labelEn }) => [key, labelEn]),
  );
  const result = await searchArticleSummaries({
    q,
    knowledgeDomain,
    sourceAccount,
    contentType,
    sdgGoal,
    timeRange,
    publicationYears,
    sort,
    page: requestedPage,
    pageSize: PAGE_SIZE,
  });
  const pages = visiblePages(result.page, result.totalPages);

  return <main className="browseShell">
    <nav className="subnav articleCenterSubnav"><Link href="/">{english ? "← Back to Q&A" : "← 返回问答"}</Link><strong>{english ? "Campus Knowledge Centre" : "校园知识中心"}</strong></nav>
    <section className="browseHero"><span className="eyebrow">BROWSE CAMPUS KNOWLEDGE</span><h1>{english ? "Browse Knowledge Base Articles" : "浏览真实知识库文章"}</h1><p>{english ? "Search article titles, summaries, official accounts or authors, and read the full article on this site." : "搜索文章标题、摘要、公众号或作者，阅读站内完整正文。"}</p></section>

    <section className="browseSection">
      <div className="articleSearchPanel">
        <div className="sectionTitle"><div><span>{english ? "ARTICLE SEARCH" : "文章检索"}</span><h2>{q ? (english ? `Results for “${q}”` : `“${q}”的搜索结果`) : (english ? "All Knowledge Articles" : "全部知识内容")}</h2></div><small>{english ? `${result.total.toLocaleString("en-GB")} articles found` : `找到 ${result.total.toLocaleString("zh-CN")} 篇`}</small></div>
        <form className="articleFilterForm" action="/articles" method="get" role="search">
          {english && <input type="hidden" name="lang" value="en" />}
          <div className="articleSearchBar">
            <input name="q" defaultValue={q} placeholder={english ? "Search titles, summaries, accounts or authors" : "搜索标题、摘要、公众号或作者"} aria-label={english ? "Search knowledge base articles" : "搜索知识库文章"} />
            <button type="submit">{english ? "Search" : "搜索"}</button>
            {(q || knowledgeDomain || sourceAccount || contentType || sdgGoal || publicationYears.length || timeRange !== "all" || sort !== "newest") && <Link href={english ? "/articles?lang=en" : "/articles"}>{english ? "Clear" : "清除"}</Link>}
          </div>
          <details className="articleFilterDisclosure" open>
            <summary>{english ? "Filter articles" : "筛选知识文章"}</summary>
            <div className="articleStructuredFilters">
              <label>
                <span>{english ? "Knowledge Domain" : "知识领域"}</span>
                <select name="domain" defaultValue={knowledgeDomain} aria-label={english ? "Filter by knowledge domain" : "按知识领域筛选"}>
                  <option value="">{english ? "All Knowledge Domains" : "全部知识领域"}</option>
                  {knowledgeDomains.map((item) => <option value={item.key} key={item.key}>{item.labelEn}</option>)}
                </select>
              </label>
              <label>
                <span>{english ? "Content Type" : "内容类型"}</span>
                <select name="type" defaultValue={contentType} aria-label={english ? "Filter by content type" : "按内容类型筛选"}>
                  <option value="">{english ? "All Content Types" : "全部类型"}</option>
                  {contentTypes.map((item) => <option value={item.key} key={item.key}>{item.labelEn}</option>)}
                </select>
              </label>
              <label>
                <span>{english ? "Source Organisation" : "来源机构"}</span>
                <select name="org" defaultValue={sourceAccount} aria-label={english ? "Filter by source organisation" : "按来源机构筛选"}>
                  <option value="">{english ? "All Source Organisations" : "全部来源机构"}</option>
                  {sourceAccounts.map((account) => <option value={account} key={account}>{account}</option>)}
                </select>
              </label>
              <label>
                <span>{english ? "SDG Goal" : "SDG 目标"}</span>
                <select name="sdg" defaultValue={sdgGoal} aria-label={english ? "Filter by SDG goal" : "按 SDG 目标筛选"}>
                  <option value="">{english ? "All SDGs" : "全部 SDG"}</option>
                  {SDG_GOALS.map((goal) => <option value={goal.value} key={goal.value}>{english ? `SDG ${goal.value}` : goal.label}</option>)}
                </select>
              </label>
              <div className="yearFilter" aria-label={english ? "Filter by publication year" : "按年份筛选"}>
                <span>{english ? "Year" : "年份"}</span>
                <details>
                  <summary>
                    <span>{selectedYearLabel(publicationYears, english)}</span>
                    <span aria-hidden="true">⌄</span>
                  </summary>
                  <div className="yearFilterPanel">
                    <p className="yearFilterHint">{english ? "Select one or more years" : "支持单选或多选"}</p>
                    <div className="yearFilterPresets" aria-label={english ? "Year ranges" : "年份范围快捷选择"}>
                      <Link href={articleCenterHref({ language, q, sourceAccount, knowledgeDomain, contentType, sdgGoal, timeRange, sort, years: [] })}>{english ? "All years" : "全部年份"}</Link>
                      <Link href={articleCenterHref({ language, q, sourceAccount, knowledgeDomain, contentType, sdgGoal, timeRange, sort, years: ARTICLE_YEARS.filter((year) => Number(year) >= 2020) })}>2020–2026</Link>
                      <Link href={articleCenterHref({ language, q, sourceAccount, knowledgeDomain, contentType, sdgGoal, timeRange, sort, years: ARTICLE_YEARS.filter((year) => Number(year) >= 2014 && Number(year) <= 2019) })}>2014–2019</Link>
                    </div>
                    <div className="yearFilterOptions">
                      {ARTICLE_YEARS.map((year) => <label key={year}>
                        <input type="checkbox" name="year" value={year} defaultChecked={publicationYears.includes(year)} />
                        <span>{year}</span>
                      </label>)}
                    </div>
                    <button className="yearFilterApply" type="submit">{english ? "Apply years" : "应用年份"}</button>
                  </div>
                </details>
              </div>
            </div>
          </details>
        </form>
      </div>

      <div className="articleGrid">{result.items.map(article => {
        const displayTitle = normalizeDisplayTitle(article.title, article.publishedAt);
        return <Link className="articleCard" href={`/articles/${article.id}${english ? "?lang=en" : ""}`} aria-label={english ? `View article: ${displayTitle}` : `查看文章：${displayTitle}`} key={article.id}>
        <div className="articleMeta"><span>{article.account || (english ? "Unknown source" : "来源未知")}</span><span>{article.publishedAt ? formatArticlePublishedAt(article.publishedAt) : (english ? "Publication date unavailable" : "发布日期未知")}</span></div>
        <h3>{displayTitle}</h3>
        {(article.primaryDomain || article.secondaryDomains?.length || article.contentType) && <div className="articleClassificationTags" aria-label="文章分类">
          {[article.primaryDomain, ...(article.secondaryDomains ?? [])].map((domain) => domain && knowledgeDomainLabels.get(domain) ? <span className="articleClassificationTag domain" key={domain}>{knowledgeDomainLabels.get(domain)}</span> : null)}
          {article.contentType && contentTypeLabels.get(article.contentType) && <span className="articleClassificationTag type">{contentTypeLabels.get(article.contentType)}</span>}
        </div>}
        {article.sdgTags?.length ? <div className="articleSdgBadges" aria-label="SDG 标签">
          {visibleArticleSdgTags(article.sdgTags).map((sdgTag) => <span className="articleSdgBadge" key={`${sdgTag.code}-${sdgTag.tag}`}>{formatSdgCode(sdgTag.code)}</span>)}
        </div> : null}
        <p>{truncateDigest(article.summary ?? article.digest, english)}</p>
        <div className="articleFooter"><small>{article.author ? (english ? `Author: ${article.author}` : `作者：${article.author}`) : article.account || (english ? "Knowledge Base" : "真实知识库")}</small><span aria-hidden="true">{english ? "Read article →" : "阅读全文 →"}</span></div>
      </Link>;
      })}</div>

      {result.total === 0 && <div className="noResults"><strong>{english ? "No matching articles" : "暂无符合条件的文章"}</strong><span>{english ? "Try adjusting the filters" : "尝试调整筛选条件"}</span></div>}

      {result.totalPages > 1 && <nav className="pagination" aria-label={english ? "Article pagination" : "文章分页"}>
        {result.page > 1
          ? <Link href={articleCenterHref({ language, q, sourceAccount, knowledgeDomain, contentType, sdgGoal, timeRange, sort, years: publicationYears, page: result.page - 1 })}>{english ? "← Previous" : "← 上一页"}</Link>
          : <span className="disabled">{english ? "← Previous" : "← 上一页"}</span>}
        <div className="paginationPages">{pages.map((page, index) => {
          const previous = pages[index - 1];
          return <span className="paginationItem" key={page}>
            {previous !== undefined && page - previous > 1 && <span className="paginationEllipsis">…</span>}
            {page === result.page
              ? <span className="active" aria-current="page">{page}</span>
              : <Link href={articleCenterHref({ language, q, sourceAccount, knowledgeDomain, contentType, sdgGoal, timeRange, sort, years: publicationYears, page })}>{page}</Link>}
          </span>;
        })}</div>
        {result.page < result.totalPages
          ? <Link href={articleCenterHref({ language, q, sourceAccount, knowledgeDomain, contentType, sdgGoal, timeRange, sort, years: publicationYears, page: result.page + 1 })}>{english ? "Next →" : "下一页 →"}</Link>
          : <span className="disabled">{english ? "Next →" : "下一页 →"}</span>}
      </nav>}
    </section>
  </main>;
}
