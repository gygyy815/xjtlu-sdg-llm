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
  const pages = visiblePages(result.page, result.totalPages);

  return <main className="browseShell">
    <nav className="subnav"><Link href="/">← 返回问答</Link><strong>校园知识中心</strong><span>{result.total.toLocaleString("zh-CN")} 篇结果</span></nav>
    <section className="browseHero"><span className="eyebrow">BROWSE CAMPUS KNOWLEDGE</span><h1>浏览真实知识库文章</h1><p>搜索文章标题、摘要、公众号或作者，阅读站内完整正文。</p></section>

    <section className="browseSection">
      <div className="sectionTitle"><div><span>文章检索</span><h2>{q ? `“${q}”的搜索结果` : "全部知识内容"}</h2></div><small>找到 {result.total.toLocaleString("zh-CN")} 篇</small></div>
      <form className="articleFilterForm" action="/articles" method="get" role="search">
        <div className="articleSearchBar">
          <input name="q" defaultValue={q} placeholder="搜索标题、摘要、公众号或作者" aria-label="搜索知识库文章" />
          <button type="submit">搜索</button>
          {(q || knowledgeDomain || organizationUnit || contentType) && <Link href="/articles">清除</Link>}
        </div>
        <div className="articleStructuredFilters">
          <label>
            <select name="domain" defaultValue={knowledgeDomain} aria-label="按知识领域筛选">
              <option value="">全部知识领域</option>
              {knowledgeDomains.map((item) => <option value={item.key} key={item.key}>{item.labelZh}</option>)}
            </select>
          </label>
          <label>
            <select name="org" defaultValue={organizationUnit} aria-label="按组织来源筛选">
              <option value="">全部组织来源</option>
              {organizationUnits.map((item) => <option value={item.key} key={item.key}>{item.labelZh}</option>)}
            </select>
          </label>
          <label>
            <select name="type" defaultValue={contentType} aria-label="按内容类型筛选">
              <option value="">全部内容类型</option>
              {contentTypes.map((item) => <option value={item.key} key={item.key}>{item.labelZh}</option>)}
            </select>
          </label>
        </div>
      </form>

      <div className="articleGrid">{result.items.map(article => <article className="articleCard" key={article.id}>
        <div className="articleMeta"><span>{article.account || "来源未知"}</span><span>{article.publishedAt ? formatArticlePublishedAt(article.publishedAt) : "发布日期未知"}</span></div>
        <h3>{article.title}</h3>
        <p>{truncateDigest(article.digest)}</p>
        <div className="articleFooter"><small>{article.author ? `作者：${article.author}` : article.account || "真实知识库"}</small><Link href={`/articles/${article.id}`}>查看详情 →</Link></div>
      </article>)}</div>

      {result.total === 0 && <div className="noResults">没有找到匹配的文章，请尝试更短或不同的关键词。</div>}

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
