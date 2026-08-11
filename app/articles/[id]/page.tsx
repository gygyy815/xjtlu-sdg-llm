import Link from "next/link";
import { notFound } from "next/navigation";
import { articles, getArticle, statusTone } from "@/lib/articles";

export function generateStaticParams() {
  return articles.map(article => ({ id: article.id }));
}

export default async function ArticleDetail({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const article = getArticle(id);
  if (!article) notFound();
  return <main className="detailShell">
    <nav className="subnav"><Link href="/articles">← 返回知识中心</Link><strong>文章详情</strong><Link href="/">返回问答</Link></nav>
    <article className="detailArticle">
      <div className="detailLabels"><span>{article.category}</span><span className={`statusPill ${statusTone(article.status)}`}>{article.status}</span></div>
      <h1>{article.title}</h1>
      <div className="detailFacts"><div><small>知识库</small><strong>{article.knowledgeBase}</strong></div><div><small>来源</small><strong>{article.source}</strong></div><div><small>发布日期</small><strong>{article.publishedDate || "未明确"}</strong></div></div>
      {(article.deadline || article.eventDate) && <aside className="timingNotice"><strong>时间信息（请以原文为准）</strong>{article.deadline && <p>{article.deadline}</p>}{article.eventDate && <p>{article.eventDate}</p>}</aside>}
      <div className="articleBody">{article.content.split(/\n{2,}/).filter(Boolean).map((paragraph, index) => <p key={index}>{paragraph.trim()}</p>)}</div>
      <div className="detailActions">{article.sourceUrl ? <a href={article.sourceUrl} target="_blank" rel="noreferrer">在微信中查看原文 ↗</a> : <span>知识库未保存有效原文链接</span>}<Link href="/articles">继续浏览文章</Link></div>
    </article>
  </main>;
}
