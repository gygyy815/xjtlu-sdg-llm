import Link from "next/link";
import { notFound } from "next/navigation";
import ReactMarkdown from "react-markdown";
import { articles, getArticle, statusTone } from "@/lib/articles";
import { getArticleById } from "@/lib/knowledge-base/repository";

export function generateStaticParams() {
  return articles.map(article => ({ id: article.id }));
}

export default async function ArticleDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const realArticle = await getArticleById(id);

  if (realArticle) {
    return <main className="detailShell">
      <nav className="subnav"><Link href="/articles">← 返回知识中心</Link><strong>文章详情</strong><Link href="/">返回问答</Link></nav>
      <article className="detailArticle">
        <div className="detailLabels"><span>真实知识库</span><span>微信公众号文章</span></div>
        <h1 className="articleTitle">{realArticle.title}</h1>
        <div className="detailFacts">
          <div><small>公众号</small><strong>{realArticle.account}</strong></div>
          {realArticle.author && <div><small>作者</small><strong>{realArticle.author}</strong></div>}
          {realArticle.publishedAt && <div><small>发布日期</small><strong>{realArticle.publishedAt}</strong></div>}
        </div>
        {realArticle.digest && <aside className="articleDigest"><strong>文章摘要</strong><p>{realArticle.digest}</p></aside>}
        <div className="articleBody articleMarkdown"><ReactMarkdown>{realArticle.content}</ReactMarkdown></div>
        <div className="detailActions">{realArticle.sourceUrl ? <a href={realArticle.sourceUrl} target="_blank" rel="noreferrer">查看微信公众号原文 ↗</a> : <span>知识库未保存有效原文链接</span>}<Link href="/articles">继续浏览文章</Link></div>
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
