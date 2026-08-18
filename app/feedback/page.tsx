"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

const QUICK_KEY = "xjtlu-feedback-v2";
const SURVEY_KEY = "xjtlu-prototype-survey-e-v1";

type Feedback = { id: string; type: string; message: string; createdAt: string };
type SurveyRecord = {
  id: string;
  createdAt: string;
  e1: "yes" | "no";
  ratings: Record<string, string>;
  e3: string;
  e4: string;
  e5: string;
};

const aspects = [
  ["overall", "整体使用体验", "Overall experience"],
  ["coverage", "知识库内容的覆盖范围与相关性", "Coverage and relevance of knowledge-base content"],
  ["categories", "知识库分类与标签的清晰度", "Clarity of knowledge-base categories and tags"],
  ["topic", "SDG 或主题识别的准确性", "Accuracy of SDG or topic recognition"],
  ["sources", "原文链接、官方来源和发布日期的清晰度", "Clarity of original links, official sources and publication dates"],
  ["validity", "对信息是否仍有效或存在不确定性的说明", "Explanation of whether information is still valid or uncertain"],
  ["wechat", "打开原微信公众号文章的便利性", "Ease of opening the original WeChat article"],
  ["translation", "中英文内容与翻译支持", "Chinese-English content and translation support"],
  ["understanding", "AI Agent 理解问题的准确性", "Accuracy of the AI Agent in understanding the question"],
  ["relevance", "回答与问题的相关性", "Relevance of the answer to the question"],
  ["accuracy", "回答内容的准确性与可信度", "Accuracy and trustworthiness of the answer"],
  ["completeness", "回答内容的完整性", "Completeness of the answer"],
  ["clarity", "回答表达的简洁与清晰程度", "Clarity and conciseness of the answer"],
  ["extraction", "长文章要点、截止时间或行动步骤的提炼", "Extraction of key points, deadlines or action steps"],
  ["context", "连续追问与上下文理解", "Follow-up questions and context understanding"],
  ["speed", "回答速度", "Response speed"],
  ["graph", "知识图谱或相关内容推荐（如已使用）", "Knowledge-graph or related-content recommendations (if used)"],
] as const;

const ratingOptions = ["1", "2", "3", "4", "5", "N/A"];

export default function FeedbackPage() {
  const [type, setType] = useState("功能建议");
  const [message, setMessage] = useState("");
  const [quickCount, setQuickCount] = useState(0);
  const [surveyCount, setSurveyCount] = useState(0);
  const [e1, setE1] = useState<"" | "yes" | "no">("");
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [e3, setE3] = useState("");
  const [e4, setE4] = useState("");
  const [e5, setE5] = useState("");
  const [surveyNotice, setSurveyNotice] = useState("");

  useEffect(() => {
    try {
      const quick = JSON.parse(localStorage.getItem(QUICK_KEY) || "[]");
      const survey = JSON.parse(localStorage.getItem(SURVEY_KEY) || "[]");
      setQuickCount(Array.isArray(quick) ? quick.length : 0);
      setSurveyCount(Array.isArray(survey) ? survey.length : 0);
    } catch {}
  }, []);

  const ratedCount = useMemo(() => Object.values(ratings).filter(Boolean).length, [ratings]);

  function submitQuick() {
    if (!message.trim()) return;
    let list: Feedback[] = [];
    try { const parsed = JSON.parse(localStorage.getItem(QUICK_KEY) || "[]"); if (Array.isArray(parsed)) list = parsed; } catch {}
    list.unshift({ id: `feedback-${Date.now()}`, type, message: message.trim(), createdAt: new Date().toISOString() });
    localStorage.setItem(QUICK_KEY, JSON.stringify(list));
    setQuickCount(list.length);
    setMessage("");
  }

  function submitSurvey() {
    if (!e1) return;
    let list: SurveyRecord[] = [];
    try { const parsed = JSON.parse(localStorage.getItem(SURVEY_KEY) || "[]"); if (Array.isArray(parsed)) list = parsed; } catch {}
    const record: SurveyRecord = {
      id: `survey-${Date.now()}`,
      createdAt: new Date().toISOString(),
      e1,
      ratings: e1 === "yes" ? ratings : {},
      e3: e1 === "yes" ? e3.trim() : "",
      e4: e1 === "yes" ? e4.trim() : "",
      e5: e1 === "yes" ? e5.trim() : "",
    };
    list.unshift(record);
    localStorage.setItem(SURVEY_KEY, JSON.stringify(list));
    setSurveyCount(list.length);
    setSurveyNotice("已保存本次原型体验反馈。当前 Beta 版存于本浏览器；正式研究采集前请接入项目声明的 Supabase。 ");
    setE1(""); setRatings({}); setE3(""); setE4(""); setE5("");
    window.setTimeout(() => setSurveyNotice(""), 5000);
  }

  function exportAll() {
    const payload = {
      exportedAt: new Date().toISOString(),
      quickFeedback: JSON.parse(localStorage.getItem(QUICK_KEY) || "[]"),
      prototypeSurvey: JSON.parse(localStorage.getItem(SURVEY_KEY) || "[]"),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = "xjtlu-demo-feedback.json"; a.click(); URL.revokeObjectURL(url);
  }

  return <main className="feedbackPage">
    <header><Link href="/">← 返回助手</Link><div><span>快速反馈 {quickCount}</span><span> · 原型问卷 {surveyCount}</span><button onClick={exportAll}>导出本机数据</button></div></header>

    <section className="feedbackHero">
      <span>FEEDBACK & PROTOTYPE EXPERIENCE</span>
      <h1>反馈与建议</h1>
      <p>这里同时提供快速反馈和 AI Agent 原型体验问卷。请勿填写姓名、学号、邮箱或其他可识别个人的信息。</p>
      <div className="researchNotice"><strong>研究流程提示</strong><p>完整主问卷与线上知情同意仍应按照问卷星流程完成；本页嵌入的是文件中专门面向“已体验 AI Agent 原型者”的 E 部分，便于在 Demo 体验后立即收集反馈。</p></div>
    </section>

    <section className="feedbackCard">
      <div className="sectionHead"><div><span>QUICK FEEDBACK</span><h2>快速记录问题或建议</h2></div></div>
      <label>反馈类型<select value={type} onChange={(e) => setType(e.target.value)}><option>功能建议</option><option>知识库问题</option><option>回答质量</option><option>界面体验</option><option>Bug</option></select></label>
      <label>具体内容<textarea value={message} onChange={(e) => setMessage(e.target.value)} placeholder="例如：知识图谱全屏后希望支持按活动类型筛选…" /></label>
      <div className="feedbackActions"><button disabled={!message.trim()} onClick={submitQuick}>保存快速反馈</button></div>
    </section>

    <section className="surveyCard">
      <div className="sectionHead"><div><span>SECTION E</span><h2>校园知识库与 AI Agent 原型体验调查</h2><small>Campus Knowledge Base and AI Agent Prototype Experience Survey</small></div><strong>{ratedCount}/{aspects.length} 项已评分</strong></div>
      <div className="surveyInstructions">
        <p>填写前，请先完成以下体验：提出一个校园信息问题；进行一次追问或修改问题；打开回答中的一条原文链接；查看回答中的来源、日期或有效状态说明（如有）。</p>
        <p>Before completing this section, ask one campus-information question, make one follow-up or revision, open one original link, and review source/date/validity information if available.</p>
      </div>

      <fieldset className="e1Block"><legend>E1. 您是否已经按照上述要求与 AI Agent 原型进行交互？<small>Have you interacted with the AI Agent prototype as described above?</small></legend>
        <label><input type="radio" name="e1" checked={e1 === "yes"} onChange={() => setE1("yes")} /> 是，我已经完成上述操作（继续 E2–E5） / Yes, I completed the tasks above</label>
        <label><input type="radio" name="e1" checked={e1 === "no"} onChange={() => setE1("no")} /> 否，我还没有完成上述操作（结束问卷） / No, I have not completed the tasks above</label>
      </fieldset>

      {e1 === "no" && <div className="surveyEnd">按照原问卷逻辑，选择“否”后无需继续 E2–E5，可直接保存本次记录。</div>}

      {e1 === "yes" && <>
        <div className="matrixTitle"><strong>E2. 您对以下方面的满意程度如何？</strong><span>1=非常不满意 · 2=不满意 · 3=一般 · 4=满意 · 5=非常满意 · N/A=不适用</span></div>
        <div className="ratingMatrix">
          <div className="ratingHeader"><span>评价项目 / Aspect</span>{ratingOptions.map((rating) => <b key={rating}>{rating}</b>)}</div>
          {aspects.map(([key, zh, en]) => <div className="ratingRow" key={key}><div><strong>{zh}</strong><small>{en}</small></div>{ratingOptions.map((rating) => <label key={rating} title={rating}><input type="radio" name={`rating-${key}`} checked={ratings[key] === rating} onChange={() => setRatings((old) => ({ ...old, [key]: rating }))} /><span>{rating}</span></label>)}</div>)}
        </div>

        <div className="openQuestions">
          <label><strong>E3. 您对知识库内容、功能或 AI Agent 能力最满意的是哪一项？为什么？</strong><small>Which knowledge-base content, function or AI Agent capability satisfied you most, and why?</small><textarea value={e3} onChange={(event) => setE3(event.target.value)} /></label>
          <label><strong>E4. 为了提高您的满意度，校园知识库或 AI Agent 最需要优先改进什么？</strong><small>What should be improved first in the campus knowledge base or AI Agent to increase your satisfaction?</small><textarea value={e4} onChange={(event) => setE4(event.target.value)} /></label>
          <label><strong>E5. 您是否发现知识库中存在缺失、过期、重复或分类不准确的内容？请简要说明。</strong><small>Did you find any missing, outdated, duplicated or incorrectly classified content in the knowledge base? Please briefly describe it.</small><textarea value={e5} onChange={(event) => setE5(event.target.value)} /></label>
        </div>
      </>}

      <div className="surveyActions"><button disabled={!e1} onClick={submitSurvey}>保存原型体验问卷</button>{surveyNotice && <span>{surveyNotice}</span>}</div>
      <p className="storageNote">当前 Demo 版本仅在本浏览器保存并可导出 JSON；正式多人研究采集时，应按研究材料中声明的数据流程接入 Supabase，而不是依赖浏览器 localStorage。</p>
    </section>

    <style jsx>{`
      .feedbackPage{min-height:100vh;background:#f6f7fa;padding:0 28px 80px;color:#19232d}.feedbackPage header{height:70px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e3e7ed}.feedbackPage header a{color:#5965d8;text-decoration:none;font-weight:700}.feedbackPage header div{display:flex;gap:4px;align-items:center;color:#7a8490;font-size:12px}.feedbackPage header button{margin-left:10px;border:1px solid #d8ddea;background:white;border-radius:9px;padding:7px 10px;color:#5965d8;cursor:pointer}.feedbackHero,.feedbackCard,.surveyCard{max-width:1000px;margin-left:auto;margin-right:auto}.feedbackHero{margin-top:46px}.feedbackHero>span,.sectionHead span{font-size:11px;letter-spacing:.13em;color:#6570dc;font-weight:800}.feedbackHero h1{font-size:34px;margin:9px 0}.feedbackHero>p{color:#6f7a85;line-height:1.7}.researchNotice{margin-top:18px;padding:14px 16px;border-left:4px solid #6670dc;background:#f0f1ff;border-radius:10px}.researchNotice p{margin:5px 0 0;color:#5e6877;line-height:1.65}.feedbackCard,.surveyCard{margin-top:22px;background:#fff;border:1px solid #e1e6ec;border-radius:18px;padding:24px}.sectionHead{display:flex;justify-content:space-between;gap:16px;align-items:flex-start;margin-bottom:18px}.sectionHead h2{margin:5px 0 2px;font-size:21px}.sectionHead small{color:#84909a}.sectionHead>strong{font-size:12px;color:#6974d9;background:#f1f2ff;padding:6px 8px;border-radius:999px}.feedbackCard label{display:block;font-size:13px;font-weight:700;margin-bottom:16px}.feedbackCard select,.feedbackCard textarea{display:block;width:100%;max-width:none;margin-top:7px;border:1px solid #d9dfe7;border-radius:11px;padding:11px 12px;background:white;font:inherit}.feedbackCard textarea{min-height:130px;resize:vertical}.feedbackActions button,.surveyActions button{border:0;border-radius:10px;background:#5b61e9;color:#fff;padding:10px 16px;font-weight:700;cursor:pointer}.feedbackActions button:disabled,.surveyActions button:disabled{opacity:.45}.surveyInstructions{padding:14px 16px;background:#f7f8fb;border-radius:12px;color:#586673;font-size:13px;line-height:1.65}.surveyInstructions p{margin:0 0 5px}.surveyInstructions p:last-child{margin-bottom:0}.e1Block{border:1px solid #e0e5eb;border-radius:13px;margin:18px 0;padding:17px}.e1Block legend{padding:0 7px;font-weight:800}.e1Block legend small{display:block;margin-top:3px;color:#7b8791;font-weight:500}.e1Block label{display:block;margin:10px 0;font-size:13px}.surveyEnd{padding:13px 15px;background:#fff7e8;border:1px solid #f1dfb8;border-radius:10px;color:#775b27}.matrixTitle{display:flex;justify-content:space-between;gap:12px;align-items:end;margin:20px 0 10px}.matrixTitle span{font-size:11px;color:#7d8993}.ratingMatrix{border:1px solid #dfe5ea;border-radius:12px;overflow:auto}.ratingHeader,.ratingRow{display:grid;grid-template-columns:minmax(300px,1fr) repeat(6,56px);min-width:680px}.ratingHeader{background:#eef2fb;font-size:11px;font-weight:800}.ratingHeader>*{padding:10px 8px;text-align:center}.ratingHeader>span{text-align:left}.ratingRow{border-top:1px solid #e5e9ed}.ratingRow>div{padding:9px 10px}.ratingRow strong,.ratingRow small{display:block}.ratingRow strong{font-size:12px}.ratingRow small{font-size:10px;color:#74818c;margin-top:2px}.ratingRow>label{display:grid;place-items:center;border-left:1px solid #edf0f3;cursor:pointer}.ratingRow>label span{display:none}.openQuestions{display:grid;gap:15px;margin-top:20px}.openQuestions label{display:block}.openQuestions strong,.openQuestions small{display:block}.openQuestions strong{font-size:13px}.openQuestions small{margin-top:3px;color:#7c8791}.openQuestions textarea{width:100%;min-height:100px;margin-top:7px;border:1px solid #d9dfe6;border-radius:10px;padding:10px;font:inherit;resize:vertical}.surveyActions{display:flex;gap:12px;align-items:center;margin-top:20px}.surveyActions span{font-size:12px;color:#2e7d61}.storageNote{font-size:11px;color:#89939d;line-height:1.6;margin:13px 0 0}@media(max-width:760px){.feedbackPage{padding-inline:14px}.sectionHead,.matrixTitle{display:block}.sectionHead>strong{display:inline-block;margin-top:10px}.ratingHeader,.ratingRow{grid-template-columns:minmax(250px,1fr) repeat(6,48px)}}
    `}</style>
  </main>;
}
