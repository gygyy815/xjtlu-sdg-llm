import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { articles, getArticle, statusTone } from "@/lib/articles";
import {
  formatArticlePublishedAt,
  normalizeArticleMarkdownForDisplay,
} from "@/lib/article-presentation";
import {
  isEnglishSourceArticle,
  resolveArticleDetailLanguage,
} from "@/lib/article-detail-language";
import { getArticleById } from "@/lib/knowledge-base/repository";
import { FileSystemTranslationRepository } from "@/lib/translation/repository";

export function generateStaticParams() {
  return articles.map(article => ({ id: article.id }));
}

type ArticleDetailProps = {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ lang?: string | string[] }>;
};

export default async function ArticleDetail({ params, searchParams }: ArticleDetailProps) {
  const { id } = await params;
  const { lang } = await searchParams;
  const requestedEnglish = lang === "en";
  const realArticle = await getArticleById(id);

  if (realArticle) {
    const sourceIsEnglish = isEnglishSourceArticle(realArticle);
    const translation = sourceIsEnglish
      ? undefined
      : await new FileSystemTranslationRepository()
          .getEnglishTranslationByArticleId(id);
    const languageState = resolveArticleDetailLanguage(
      realArticle,
      translation,
      requestedEnglish,
      sourceIsEnglish,
    );
    const displayArticle = languageState.displayArticle;
    const displayMarkdown = displayArticle
      ? normalizeArticleMarkdownForDisplay(displayArticle)
      : undefined;
    const sourceHref = `/articles/${id}`;
    const englishHref = `/articles/${id}?lang=en`;
    const englishInterface = requestedEnglish;

    return <main className="detailShell">
      <nav className="subnav"><Link href="/articles">← 返回知识中心</Link><strong>文章详情</strong><Link href="/">返回问答</Link></nav>
      <article className="detailArticle">
        <nav className="languageSwitch" aria-label="Article language">
          <Link href={sourceHref} aria-current={!requestedEnglish ? "page" : undefined} className={!requestedEnglish ? "active" : undefined}>{languageState.sourceIsEnglish ? "原文" : "中文"}</Link>
          {languageState.englishAvailable
            ? <Link href={englishHref} aria-current={requestedEnglish ? "page" : undefined} className={requestedEnglish ? "active" : undefined}>English</Link>
            : requestedEnglish
              ? <span className="active" aria-current="page">English</span>
              : <span className="disabled" aria-disabled="true" title="English translation is not available yet.">English</span>}
        </nav>
        <div className="detailLabels"><span>真实知识库</span><span>微信公众号文章</span></div>
        <h1 className="articleTitle">{displayArticle?.title ?? "English translation is not available yet."}</h1>
        <div className="detailFacts">
          <div><small>{englishInterface ? "Official account" : "公众号"}</small><strong>{realArticle.account}</strong></div>
          {realArticle.author && <div><small>{englishInterface ? "Author" : "作者"}</small><strong>{realArticle.author}</strong></div>}
          {realArticle.publishedAt && <div><small>{englishInterface ? "Published" : "发布日期"}</small><strong>{formatArticlePublishedAt(realArticle.publishedAt)}</strong></div>}
        </div>
        {displayArticle?.digest && <aside className="articleDigest"><strong>{englishInterface ? "Summary" : "文章摘要"}</strong><p>{displayArticle.digest}</p></aside>}
        {displayMarkdown !== undefined
          ? <div className="articleBody articleMarkdown"><ReactMarkdown>{displayMarkdown}</ReactMarkdown></div>
          : <div className="translationUnavailable" role="status"><p>English translation is not available yet.</p><Link href={sourceHref}>查看中文原文</Link></div>}
        <div className="detailActions">{realArticle.sourceUrl ? <a href={realArticle.sourceUrl} target="_blank" rel="noreferrer">{englishInterface ? "View original WeChat article ↗" : "查看微信公众号原文 ↗"}</a> : <span>{englishInterface ? "No valid source link is stored." : "知识库未保存有效原文链接"}</span>}<Link href="/articles">{englishInterface ? "Browse more articles" : "继续浏览文章"}</Link></div>
      </article>
    </main>;
  }

  const article = getArticle(id);
  if (!article) notFound();
  return <main className="detailShell">
    <nav className="subnav"><Link href="/articles">← 返回知识中心</Link><strong>文章详情</strong><Link href="/">返回问答</Link></nav>
    <article className="detailArticle">
      <div className="detailLabels"><span>{article.category}</span><span className={`statusPill ${statusTone(article.status)}`}>{article.status}</span></div>
      <h1 className="articleTitle">{article.title}</h1>
      <div className="detailFacts"><div><small>知识库</small><strong>{article.knowledgeBase}</strong></div><div><small>来源</small><strong>{article.source}</strong></div><div><small>发布日期</small><strong>{article.publishedDate || "未明确"}</strong></div></div>
      {(article.deadline || article.eventDate) && <aside className="timingNotice"><strong>时间信息（请以原文为准）</strong>{article.deadline && <p>{article.deadline}</p>}{article.eventDate && <p>{article.eventDate}</p>}</aside>}
      <div className="articleBody">{article.content.split(/\n{2,}/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph.trim()}</p>)}</div>
      <div className="detailActions">{article.sourceUrl ? <a href={article.sourceUrl} target="_blank" rel="noreferrer">在微信中查看原文 ↗</a> : <span>知识库未保存有效原文链接</span>}<Link href="/articles">继续浏览文章</Link></div>
    </article>
  </main>;
}
