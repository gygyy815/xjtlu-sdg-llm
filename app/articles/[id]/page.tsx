import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { articles, getArticle, statusTone } from "@/lib/articles";
import {
  formatArticlePublishedAt,
  normalizeDisplayTitle,
  normalizeArticleMarkdownForDisplay,
} from "@/lib/article-presentation";
import {
  isEnglishSourceArticle,
  resolveArticleDetailLanguage,
} from "@/lib/article-detail-language";
import {
  articleCenterHref,
  articleDetailHref,
  firstSearchParam,
  resolveArticleSortParam,
  resolveArticleTimeRangeParam,
  resolveArticleYearParams,
  resolveKnowledgeDomainParam,
  resolveSdgGoalParam,
} from "@/lib/article-center-query";
import { getArticleById } from "@/lib/knowledge-base/repository";
import { formatSdgCode } from "@/lib/knowledge-base/sdg-goals";
import { getTranslationStatus } from "@/lib/translation/status";
import { buildInstantEnglishPreview } from "@/lib/translation/instant";
import LazyTranslation from "./LazyTranslation";

export function generateStaticParams() {
  return articles.map(article => ({ id: article.id }));
}

type ArticleDetailProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{
    lang?: string | string[];
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
  }>;
};

export default async function ArticleDetail({ params, searchParams }: ArticleDetailProps) {
  const { id } = await params;
  const queryParams = await searchParams;
  const requestedEnglish = firstSearchParam(queryParams.lang) === "en";
  const language = requestedEnglish ? "en" : "zh";
  const q = firstSearchParam(queryParams.q)?.trim() ?? "";
  const knowledgeDomain = resolveKnowledgeDomainParam(queryParams.domain, queryParams.kb)?.trim() ?? "";
  const sourceAccount = firstSearchParam(queryParams.org)?.trim() ?? "";
  const contentType = firstSearchParam(queryParams.type)?.trim() ?? "";
  const sdgGoal = resolveSdgGoalParam(queryParams.sdg);
  const timeRange = resolveArticleTimeRangeParam(queryParams.time);
  const sort = resolveArticleSortParam(queryParams.sort);
  const years = resolveArticleYearParams(queryParams.year);
  const page = Number(firstSearchParam(queryParams.page));
  const currentPage = Number.isSafeInteger(page) && page > 0 ? page : 1;
  const realArticle = await getArticleById(id);

  if (realArticle) {
    const sourceIsEnglish = isEnglishSourceArticle(realArticle);
    const translationStatus = sourceIsEnglish
      ? undefined
      : await getTranslationStatus(id, { article: realArticle });
    const translation = translationStatus?.status === "fresh"
      ? translationStatus.record
      : undefined;
    const languageState = resolveArticleDetailLanguage(
      realArticle,
      translation,
      requestedEnglish,
      sourceIsEnglish,
    );
    const instantPreview = requestedEnglish && !languageState.sourceIsEnglish && !languageState.displayArticle
      ? buildInstantEnglishPreview(realArticle)
      : undefined;
    const displayArticle = languageState.displayArticle ?? instantPreview?.article;
    const displayTitle = displayArticle
      ? normalizeDisplayTitle(displayArticle.title, realArticle.publishedAt)
      : undefined;
    const displayMarkdown = displayArticle
      ? normalizeArticleMarkdownForDisplay(displayArticle, {
          translatedContent:
            requestedEnglish && !languageState.sourceIsEnglish,
        })
      : undefined;
    const browseQuery = { language, q, knowledgeDomain, sourceAccount, contentType, sdgGoal, timeRange, sort, years, page: currentPage } as const;
    const sourceHref = articleDetailHref(id, browseQuery);
    const englishHref = articleDetailHref(id, { ...browseQuery, language: "en" });
    const englishInterface = requestedEnglish;
    const articleBrowseHref = articleCenterHref(browseQuery);

    return <main className="detailShell">
      <nav className="subnav"><Link className="browseKnowledgeButton" href={articleBrowseHref}>{englishInterface ? "← Browse Knowledge Base" : "← 浏览知识库"}</Link><strong>{englishInterface ? "Article Details" : "文章详情"}</strong><Link href="/">{englishInterface ? "Back to Q&A" : "返回问答"}</Link></nav>
      <article className="detailArticle">
        <Link className="detailBrowseKnowledgeButton" href={articleBrowseHref}>
          {englishInterface ? "← Browse Knowledge Base" : "← 浏览知识库"}
        </Link>
        <nav className="languageSwitch" aria-label="Article language">
          <Link href={sourceHref} aria-current={!requestedEnglish ? "page" : undefined} className={!requestedEnglish ? "active" : undefined}>{languageState.sourceIsEnglish ? (englishInterface ? "Original" : "原文") : "中文"}</Link>
          {languageState.englishAvailable
            ? <Link href={englishHref} aria-current={requestedEnglish ? "page" : undefined} className={requestedEnglish ? "active" : undefined}>English</Link>
            : requestedEnglish
              ? <span className="active" aria-current="page">English</span>
              : <Link href={englishHref} className="pending" aria-label="Generate English translation">English</Link>}
        </nav>
        <div className="detailLabels"><span>{englishInterface ? "Knowledge Base" : "真实知识库"}</span><span>{englishInterface ? "WeChat Official Account Article" : "微信公众号文章"}</span></div>
        {englishInterface && !languageState.sourceIsEnglish && languageState.englishAvailable && <p className="machineTranslationNotice">Machine-translated English version</p>}
        {englishInterface && instantPreview && <p className="machineTranslationNotice instantTranslationNotice">Instant English preview (partial terminology only). A validated full translation is not available yet.</p>}
        <h1 className="articleTitle">{displayTitle ?? "English translation is not available yet."}</h1>
        <div className="detailFacts">
          <div><small>{englishInterface ? "Official account" : "公众号"}</small><strong>{realArticle.account}</strong></div>
          {realArticle.author && <div><small>{englishInterface ? "Author" : "作者"}</small><strong>{realArticle.author}</strong></div>}
          {realArticle.publishedAt && <div><small>{englishInterface ? "Published" : "发布日期"}</small><strong>{formatArticlePublishedAt(realArticle.publishedAt)}</strong></div>}
        </div>
        {(displayArticle?.summary || displayArticle?.digest) && <aside className="articleDigest"><strong>{englishInterface ? "Summary" : "文章摘要"}</strong><p>{displayArticle.summary ?? displayArticle.digest}</p></aside>}
        <div className="articleSourceAction">
          {realArticle.sourceUrl
            ? <a href={realArticle.sourceUrl} target="_blank" rel="noreferrer">{englishInterface ? "View original WeChat article ↗" : "查看微信公众号原文 ↗"}</a>
            : <span>{englishInterface ? "No valid source link is stored." : "知识库未保存有效原文链接"}</span>}
        </div>
        {realArticle.sdgTags?.length ? <section className="articleSdgReferences" aria-labelledby="sdg-reference-heading">
          <h2 id="sdg-reference-heading">{englishInterface ? "SDG Tags and Official References" : "SDG 标签与官方参考"}</h2>
          <div className="articleSdgReferenceList">
            {realArticle.sdgTags.map((sdgTag) => <a className="articleSdgReference" href={sdgTag.url} target="_blank" rel="noreferrer" aria-label={`${formatSdgCode(sdgTag.code)} ${sdgTag.tag}：${englishInterface ? "Official UN reference" : "联合国官方参考"}`} key={`${sdgTag.code}-${sdgTag.tag}-${sdgTag.url}`}>
              <div><strong>{formatSdgCode(sdgTag.code)}</strong>{sdgTag.level && <span>{englishInterface && sdgTag.level === "target" ? "Target" : sdgTag.level}</span>}</div>
              <h3>{sdgTag.tag}</h3>
              {sdgTag.reason && <p>{sdgTag.reason}</p>}
              <span className="articleSdgReferenceCta">{englishInterface ? "Official UN reference ↗" : "联合国官方参考 ↗"}</span>
            </a>)}
          </div>
        </section> : null}
        {requestedEnglish && !languageState.sourceIsEnglish && !languageState.englishAvailable && <LazyTranslation articleId={id} sourceHref={sourceHref} />}
        {displayMarkdown !== undefined
          ? <div className="articleBody articleMarkdown"><ReactMarkdown>{displayMarkdown}</ReactMarkdown></div>
          : <div className="translationUnavailable" role="status"><p>English translation is not available yet.</p><Link href={sourceHref}>查看中文原文</Link></div>}
        <div className="detailActions"><Link href={articleBrowseHref}>{englishInterface ? "Browse more articles" : "继续浏览文章"}</Link></div>
      </article>
    </main>;
  }

  const article = getArticle(id);
  if (!article) notFound();
  const fallbackBrowseHref = articleCenterHref({ language: requestedEnglish ? "en" : "zh", q, knowledgeDomain, sourceAccount, contentType, sdgGoal, timeRange, sort, years, page: currentPage });
  return <main className="detailShell">
    <nav className="subnav"><Link className="browseKnowledgeButton" href={fallbackBrowseHref}>← 浏览知识库</Link><strong>文章详情</strong><Link href="/">返回问答</Link></nav>
    <article className="detailArticle">
      <Link className="detailBrowseKnowledgeButton" href={fallbackBrowseHref}>← 浏览知识库</Link>
      <div className="detailLabels"><span>{article.category}</span><span className={`statusPill ${statusTone(article.status)}`}>{article.status}</span></div>
      <h1 className="articleTitle">{normalizeDisplayTitle(article.title, article.publishedDate)}</h1>
      <div className="detailFacts"><div><small>知识库</small><strong>{article.knowledgeBase}</strong></div><div><small>来源</small><strong>{article.source}</strong></div><div><small>发布日期</small><strong>{article.publishedDate || "未明确"}</strong></div></div>
      {(article.deadline || article.eventDate) && <aside className="timingNotice"><strong>时间信息（请以原文为准）</strong>{article.deadline && <p>{article.deadline}</p>}{article.eventDate && <p>{article.eventDate}</p>}</aside>}
      <div className="articleSourceAction">{article.sourceUrl ? <a href={article.sourceUrl} target="_blank" rel="noreferrer">在微信中查看原文 ↗</a> : <span>知识库未保存有效原文链接</span>}</div>
      <div className="articleBody">{article.content.split(/\n{2,}/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph.trim()}</p>)}</div>
      <div className="detailActions"><Link href={fallbackBrowseHref}>继续浏览文章</Link></div>
    </article>
  </main>;
}
