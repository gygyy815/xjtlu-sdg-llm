"use client";

import Link from "next/link";
import { useMemo, useState } from "react";
import { articles, statusTone } from "@/lib/articles";

export default function ArticlesPage() {
  const [query, setQuery] = useState("");
  const [knowledgeBase, setKnowledgeBase] = useState("");
  const [category, setCategory] = useState("");
  const [status, setStatus] = useState("");
  const options = (key: "knowledgeBase" | "category" | "status") => [...new Set(articles.map(article => article[key]))];
  const filtered = useMemo(() => articles.filter(article => {
    const text = `${article.title} ${article.excerpt} ${article.source}`.toLowerCase();
    return (!query || text.includes(query.toLowerCase()))
      && (!knowledgeBase || article.knowledgeBase === knowledgeBase)
      && (!category || article.category === category)
      && (!status || article.status === status);
  }), [query, knowledgeBase, category, status]);
  const upcoming = articles.filter(article => article.status === "需核查截止日期" || article.status === "需核查活动日期").slice(0, 6);

  return <main className="browseShell">
    <nav className="subnav"><Link href="/">← 返回问答</Link><strong>校园知识中心</strong><span>{articles.length} 篇已核查来源</span></nav>
    <section className="browseHero"><span className="eyebrow">BROWSE CAMPUS KNOWLEDGE</span><h1>浏览文章与近期活动</h1><p>按公众号、内容类型和时效状态查找；日期状态仅依据文章中的明确证据。</p></section>

    {upcoming.length > 0 && <section className="browseSection"><div className="sectionTitle"><div><span>近期活动中心</span><h2>需要关注日期的内容</h2></div><small>请进入详情核查具体时间</small></div><div className="highlightGrid">{upcoming.map(article => <Link className="highlightCard" href={`/articles/${article.id}`} key={article.id}><span className={`statusPill ${statusTone(article.status)}`}>{article.status}</span><h3>{article.title}</h3><p>{article.deadline || article.eventDate || "正文包含活动信息，但未识别出完整日期。"}</p><small>{article.knowledgeBase} · {article.publishedDate || "发布日期未知"}</small></Link>)}</div></section>}

    <section className="browseSection"><div className="sectionTitle"><div><span>分类检索</span><h2>全部知识内容</h2></div><small>找到 {filtered.length} 篇</small></div>
      <div className="filterBar"><input value={query} onChange={event => setQuery(event.target.value)} placeholder="搜索标题、来源或正文摘要"/><select value={knowledgeBase} onChange={event => setKnowledgeBase(event.target.value)}><option value="">全部知识库</option>{options("knowledgeBase").map(value => <option key={value}>{value}</option>)}</select><select value={category} onChange={event => setCategory(event.target.value)}><option value="">全部分类</option>{options("category").map(value => <option key={value}>{value}</option>)}</select><select value={status} onChange={event => setStatus(event.target.value)}><option value="">全部时效状态</option>{options("status").map(value => <option key={value}>{value}</option>)}</select></div>
      <div className="articleGrid">{filtered.map(article => <article className="articleCard" key={article.id}><div className="articleMeta"><span>{article.category}</span><span className={`statusPill ${statusTone(article.status)}`}>{article.status}</span></div><h3>{article.title}</h3><p>{article.excerpt}</p><div className="articleFooter"><small>{article.knowledgeBase}<br/>{article.publishedDate || "发布日期未知"}</small><Link href={`/articles/${article.id}`}>查看详情 →</Link></div></article>)}</div>
      {!filtered.length && <div className="noResults">没有符合当前筛选条件的文章。</div>}
    </section>
  </main>;
}
