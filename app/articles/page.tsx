import Link from "next/link";
import { formatArticlePublishedAt } from "@/lib/article-presentation";
import {
  articleCenterHref,
  firstSearchParam,
  parseArticleCenterPage,
  resolveKnowledgeDomainParam,
} from "@/lib/article-center-query";
import { contentTypeCatalog } from "@/lib/classification/content-types";
import { knowledgeDomainCatalog } from "@/lib/classification/knowledge-domains";
import { organizationUnitCatalog } from "@/lib/classification/organization-units";
import { searchArticleSummaries } from "@/lib/knowledge-base/repository";

const PAGE_SIZE = 18;
const DIGEST_MAX_LENGTH = 180;

type ArticlesPageProps = {
  searchParams: Promise<{
    q?: string | string[];
    domain?: string | string[];
    kb?: string | string[];
    org?: string | string[];
    type?: string | string[];
    page?: string | string[];
  }>;
};

function visiblePages(page: number, totalPages: number) {
  const candidates = new Set([1, totalPages, page - 1, page, page + 1]);
  return [...candidates]
    .filter((candidate) => candidate >= 1 && candidate <= totalPages)
    .sort((left, right) => left - right);
}

function truncateDigest(digest: string | undefined) {
  const normalized = digest?.replace(/\s+/g, " ").trim();
  if (!normalized) return "暂无摘要，可进入详情阅读全文。";
  if (normalized.length <= DIGEST_MAX_LENGTH) return normalized;
  return `${normalized.slice(0, DIGEST_MAX_LENGTH - 1).trimEnd()}…`;
}

export default async function ArticlesPage({ searchParams }: ArticlesPageProps) {
  const params = await searchParams;
  const q = firstSearchParam(params.q)?.trim() ?? "";
  const knowledgeDomain =
    resolveKnowledgeDomainParam(params.domain, params.kb)?.trim() ?? "";
  const contentType = firstSearchParam(params.type)?.trim() ?? "";
  const organizationUnit = firstSearchParam(params.org)?.trim() ?? "";
  const requestedPage = parseArticleCenterPage(firstSearchParam(params.page));
  const knowledgeDomains = knowledgeDomainCatalog();
  const contentTypes = contentTypeCatalog();
  const organizationUnits = organizationUnitCatalog();
  const result = await searchArticleSummaries({
    q,
    knowledgeDomain,
    organizationUnit,
    contentType,
    page: requestedPage,
    pageSize: PAGE_SIZE,
  });
  const knowledgeDomainLabels = new Map(
    knowledgeDomains.map(({ key, labelEn }) => [key, labelEn]),
  );
  const contentTypeLabels = new Map(
    contentTypes.map(({ key, labelEn }) => [key, labelEn]),
  );
  const pages = visiblePages(result.page, result.totalPages);

  return <main className="browseShell">
    <section className="consumerPageHead">
      <div>
        <span className="consumerEyebrow">CAMPUS KNOWLEDGE</span>
        <h1>浏览知识</h1>
        <p>搜索校园文章、活动、政策与服务信息，进入详情页查看完整正文和原始来源。</p>
      </div>
    </section>

    <section className="browseSection">
      <div className="articleSearchPanel">
        <div className="sectionTitle"><div><span>文章检索</span><h2>{q ? `“${q}”的搜索结果` : "全部知识内容"}</h2></div><small>找到 {result.total.toLocaleString("zh-CN")} 篇</small></div>
        <form className="articleFilterForm" action="/articles" method="get" role="search">
          <div className="articleSearchBar">
            <input name="q" defaultValue={q} placeholder="搜索标题、摘要、公众号或作者" aria-label="搜索知识库文章" />
            <button type="submit">搜索</button>
            {(q || knowledgeDomain || organizationUnit || contentType) && <Link href="/articles">清除</Link>}
          </div>
          <details className="articleFilterDisclosure" open>
            <summary>筛选知识文章</summary>
            <div className="articleStructuredFilters">
              <label>
                <span>知识领域</span>
                <select name="domain" defaultValue={knowledgeDomain} aria-label="按知识领域筛选">
                  <option value="">全部知识领域</option>
                  {knowledgeDomains.map((item) => <option value={item.key} key={item.key}>{item.labelEn}</option>)}
                </select>
              </label>
              <label>
                <span>内容类型</span>
                <select name="type" defaultValue={contentType} aria-label="按内容类型筛选">
                  <option value="">全部类型</option>
                  {contentTypes.map((item) => <option value={item.key} key={item.key}>{item.labelEn}</option>)}
                </select>
              </label>
              <label>
                <span>来源机构</span>
                <select name="org" defaultValue={organizationUnit} aria-label="按来源机构筛选">
                  <option value="">全部来源机构</option>
                  {organizationUnits.map((item) => <option value={item.key} key={item.key}>{item.labelZh}</option>)}
                </select>
              </label>
            </div>
          </details>
        </form>
      </div>

      <div className="articleGrid">{result.items.map(article => <article className="articleCard" key={article.id}>
        <div className="articleMeta"><span>{article.account || "来源未知"}</span><span>{article.publishedAt ? formatArticlePublishedAt(article.publishedAt) : "发布日期未知"}</span></div>
        <h3>{article.title}</h3>
        {(article.primaryDomain || article.secondaryDomains?.length || article.contentType) && <div className="articleClassificationTags" aria-label="文章分类">
          {[article.primaryDomain, ...(article.secondaryDomains ?? [])].map((domain) => domain && knowledgeDomainLabels.get(domain) ? <span className="articleClassificationTag domain" key={domain}>{knowledgeDomainLabels.get(domain)}</span> : null)}
          {article.contentType && contentTypeLabels.get(article.contentType) && <span className="articleClassificationTag type">{contentTypeLabels.get(article.contentType)}</span>}
        </div>}
        <p>{truncateDigest(article.digest)}</p>
        <div className="articleFooter"><small>{article.author ? `作者：${article.author}` : article.account || "真实知识库"}</small><Link href={`/articles/${article.id}`}>查看详情 →</Link></div>
      </article>)}</div>

      {result.total === 0 && <div className="noResults"><strong>暂无符合条件的文章</strong><span>尝试调整筛选条件</span></div>}

      {result.totalPages > 1 && <nav className="pagination" aria-label="文章分页">
        {result.page > 1
          ? <Link href={articleCenterHref({ q, knowledgeDomain, organizationUnit, contentType, page: result.page - 1 })}>← 上一页</Link>
          : <span className="disabled">← 上一页</span>}
        <div className="paginationPages">{pages.map((page, index) => {
          const previous = pages[index - 1];
          return <span className="paginationItem" key={page}>
            {previous !== undefined && page - previous > 1 && <span className="paginationEllipsis">…</span>}
            {page === result.page
              ? <span className="active" aria-current="page">{page}</span>
              : <Link href={articleCenterHref({ q, knowledgeDomain, organizationUnit, contentType, page })}>{page}</Link>}
          </span>;
        })}</div>
        {result.page < result.totalPages
          ? <Link href={articleCenterHref({ q, knowledgeDomain, organizationUnit, contentType, page: result.page + 1 })}>下一页 →</Link>
          : <span className="disabled">下一页 →</span>}
      </nav>}
    </section>
  </main>;
}
