"use client";

import { useEffect, useMemo, useState } from "react";
import { useProductLanguage } from "@/lib/product-language";

const QUICK_KEY = "xjtlu-feedback-v2";
const SURVEY_KEY = "xjtlu-prototype-survey-e-v1";

type Feedback = { id: string; type: string; message: string; createdAt: string };
type SurveyRecord = { id: string; createdAt: string; e1: "yes" | "no"; ratings: Record<string, string>; e3: string; e4: string; e5: string };

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
const feedbackTypes = [
  ["功能建议", "Feature suggestion"],
  ["知识库问题", "Knowledge-base issue"],
  ["回答质量", "Answer quality"],
  ["界面体验", "Interface experience"],
  ["Bug", "Bug"],
] as const;

export default function FeedbackPage() {
  const { lang, t } = useProductLanguage();
  const [type, setType] = useState("功能建议");
  const [message, setMessage] = useState("");
  const [quickCount, setQuickCount] = useState(0);
  const [surveyCount, setSurveyCount] = useState(0);
  const [storageMode, setStorageMode] = useState<"checking" | "supabase" | "local">("checking");
  const [e1, setE1] = useState<"" | "yes" | "no">("");
  const [ratings, setRatings] = useState<Record<string, string>>({});
  const [e3, setE3] = useState("");
  const [e4, setE4] = useState("");
  const [e5, setE5] = useState("");
  const [quickNotice, setQuickNotice] = useState("");
  const [surveyNotice, setSurveyNotice] = useState("");
  const [submitting, setSubmitting] = useState(false);

  useEffect(() => {
    let localQuick = 0;
    let localSurvey = 0;
    try {
      const quick = JSON.parse(localStorage.getItem(QUICK_KEY) || "[]");
      const survey = JSON.parse(localStorage.getItem(SURVEY_KEY) || "[]");
      localQuick = Array.isArray(quick) ? quick.length : 0;
      localSurvey = Array.isArray(survey) ? survey.length : 0;
      setQuickCount(localQuick);
      setSurveyCount(localSurvey);
    } catch {}

    fetch("/api/feedback", { cache: "no-store" })
      .then((response) => response.json())
      .then((data) => {
        if (data?.configured && data?.storage === "supabase" && !data?.error) {
          setStorageMode("supabase");
          setQuickCount(Number(data.quickCount || 0));
          setSurveyCount(Number(data.surveyCount || 0));
        } else {
          setStorageMode("local");
        }
      })
      .catch(() => setStorageMode("local"));
  }, []);

  const ratedCount = useMemo(() => Object.values(ratings).filter(Boolean).length, [ratings]);

  function saveLocal(key: string, record: Feedback | SurveyRecord) {
    let list: (Feedback | SurveyRecord)[] = [];
    try {
      const parsed = JSON.parse(localStorage.getItem(key) || "[]");
      if (Array.isArray(parsed)) list = parsed;
    } catch {}
    list.unshift(record);
    localStorage.setItem(key, JSON.stringify(list));
    return list.length;
  }

  async function storeRemote(kind: "quick" | "survey", payload: Record<string, unknown>) {
    const response = await fetch("/api/feedback", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, payload }),
    });
    const data = await response.json();
    if (!response.ok) throw new Error(data.error || t("保存失败。", "Unable to save."));
    return Boolean(data.stored);
  }

  async function submitQuick() {
    if (!message.trim() || submitting) return;
    const record: Feedback = { id: `feedback-${Date.now()}`, type, message: message.trim(), createdAt: new Date().toISOString() };
    setSubmitting(true);
    setQuickNotice("");
    try {
      const stored = await storeRemote("quick", record as unknown as Record<string, unknown>);
      if (stored) {
        setStorageMode("supabase");
        setQuickCount((value) => value + 1);
        setQuickNotice(t("已提交至研究反馈数据库。感谢你的建议。", "Submitted to the research feedback database. Thank you."));
      } else {
        const count = saveLocal(QUICK_KEY, record);
        setStorageMode("local");
        setQuickCount(count);
        setQuickNotice(t("Supabase 尚未配置，本次反馈已保存在当前浏览器。", "Supabase is not configured, so this feedback was saved in the current browser."));
      }
      setMessage("");
    } catch {
      const count = saveLocal(QUICK_KEY, record);
      setStorageMode("local");
      setQuickCount(count);
      setQuickNotice(t("远程保存暂时不可用，本次反馈已安全保存在当前浏览器。", "Remote storage is temporarily unavailable. This feedback was saved in the current browser."));
    } finally {
      setSubmitting(false);
    }
  }

  async function submitSurvey() {
    if (!e1 || submitting) return;
    const record: SurveyRecord = {
      id: `survey-${Date.now()}`,
      createdAt: new Date().toISOString(),
      e1,
      ratings: e1 === "yes" ? ratings : {},
      e3: e1 === "yes" ? e3.trim() : "",
      e4: e1 === "yes" ? e4.trim() : "",
      e5: e1 === "yes" ? e5.trim() : "",
    };
    setSubmitting(true);
    setSurveyNotice("");
    try {
      const stored = await storeRemote("survey", record as unknown as Record<string, unknown>);
      if (stored) {
        setStorageMode("supabase");
        setSurveyCount((value) => value + 1);
        setSurveyNotice(t("已提交至研究反馈数据库。", "Submitted to the research feedback database."));
      } else {
        const count = saveLocal(SURVEY_KEY, record);
        setStorageMode("local");
        setSurveyCount(count);
        setSurveyNotice(t("Supabase 尚未配置，本次问卷已保存在当前浏览器。", "Supabase is not configured, so this survey was saved in the current browser."));
      }
      setE1("");
      setRatings({});
      setE3("");
      setE4("");
      setE5("");
    } catch {
      const count = saveLocal(SURVEY_KEY, record);
      setStorageMode("local");
      setSurveyCount(count);
      setSurveyNotice(t("远程保存暂时不可用，本次问卷已安全保存在当前浏览器。", "Remote storage is temporarily unavailable. This survey was saved in the current browser."));
    } finally {
      setSubmitting(false);
    }
  }

  function exportAll() {
    const payload = {
      exportedAt: new Date().toISOString(),
      quickFeedback: JSON.parse(localStorage.getItem(QUICK_KEY) || "[]"),
      prototypeSurvey: JSON.parse(localStorage.getItem(SURVEY_KEY) || "[]"),
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "xjtlu-demo-feedback-local-backup.json";
    a.click();
    URL.revokeObjectURL(url);
  }

  const storageLabel = storageMode === "supabase"
    ? t("Supabase 已连接", "Supabase connected")
    : storageMode === "local"
      ? t("本机备用存储", "Browser fallback storage")
      : t("检查存储…", "Checking storage…");

  return <main className="feedbackPage cleanPage">
    <section className="feedbackHero cleanPageHeader">
      <span>FEEDBACK</span>
      <h1>{t("反馈与建议", "Feedback and suggestions")}</h1>
      <p>{t("快速记录问题或建议，也可以在体验原型后完成研究问卷。请勿填写姓名、学号、邮箱或其他不必要的个人信息。", "Quickly report an issue or suggestion, or complete the research survey after trying the prototype. Do not enter names, student IDs, email addresses or other unnecessary personal information.")}</p>
      <div className="feedbackMetaRow"><span className={`storageBadge ${storageMode}`}>{storageLabel}</span><span>{t(`快速反馈 ${quickCount}`, `Quick feedback ${quickCount}`)}</span><span>{t(`原型问卷 ${surveyCount}`, `Prototype surveys ${surveyCount}`)}</span><button type="button" className="textAction" onClick={exportAll}>{t("导出本机备份", "Export browser backup")}</button></div>
    </section>

    <section className="feedbackCard cleanCard">
      <div className="sectionHead"><div><span>QUICK FEEDBACK</span><h2>{t("快速记录问题或建议", "Quick feedback")}</h2></div></div>
      <label>{t("反馈类型", "Feedback type")}<select value={type} onChange={(event) => setType(event.target.value)}>{feedbackTypes.map(([zh, en]) => <option key={zh} value={zh}>{lang === "en" ? en : zh}</option>)}</select></label>
      <label>{t("具体内容", "Details")}<textarea value={message} onChange={(event) => setMessage(event.target.value)} placeholder={t("例如：希望知识图谱全屏后支持按活动类型筛选…", "For example: I would like the full-screen knowledge graph to support filtering by event type…")} /></label>
      <div className="feedbackActions"><button disabled={!message.trim() || submitting} onClick={submitQuick}>{submitting ? t("正在保存…", "Saving…") : t("提交快速反馈", "Submit feedback")}</button>{quickNotice && <span>{quickNotice}</span>}</div>
    </section>

    <section className="surveyCard cleanCard">
      <div className="sectionHead"><div><span>SECTION E</span><h2>{t("校园知识库与 AI Agent 原型体验调查", "Campus Knowledge Base and AI Agent Prototype Experience Survey")}</h2></div><strong>{t(`${ratedCount}/${aspects.length} 项已评分`, `${ratedCount}/${aspects.length} rated`)}</strong></div>
      <div className="surveyInstructions"><p>{t("填写前，请先完成以下体验：提出一个校园信息问题；进行一次追问或修改问题；打开回答中的一条原文链接；查看来源、日期或有效状态说明（如有）。", "Before completing this section, ask one campus-information question, make one follow-up or revision, open one original link, and review source, date or validity information if available.")}</p></div>

      <fieldset className="e1Block"><legend>{t("E1. 您是否已经按照上述要求与 AI Agent 原型进行交互？", "E1. Have you interacted with the AI Agent prototype as described above?")}</legend>
        <label><input type="radio" name="e1" checked={e1 === "yes"} onChange={() => setE1("yes")} /> {t("是，我已经完成上述操作（继续 E2–E5）", "Yes, I completed the tasks above (continue to E2–E5)")}</label>
        <label><input type="radio" name="e1" checked={e1 === "no"} onChange={() => setE1("no")} /> {t("否，我还没有完成上述操作（结束问卷）", "No, I have not completed the tasks above (end the survey)")}</label>
      </fieldset>

      {e1 === "no" && <div className="surveyEnd">{t("选择“否”后无需继续 E2–E5，可直接保存本次记录。", "If you select No, you do not need to complete E2–E5 and can save this response now.")}</div>}

      {e1 === "yes" && <>
        <div className="matrixTitle"><strong>{t("E2. 您对以下方面的满意程度如何？", "E2. How satisfied are you with the following aspects?")}</strong><span>{t("1=非常不满意 · 2=不满意 · 3=一般 · 4=满意 · 5=非常满意 · N/A=不适用", "1=Very dissatisfied · 2=Dissatisfied · 3=Neutral · 4=Satisfied · 5=Very satisfied · N/A=Not applicable")}</span></div>
        <div className="ratingMatrix"><div className="ratingHeader"><span>{t("评价项目", "Aspect")}</span>{ratingOptions.map((rating) => <b key={rating}>{rating}</b>)}</div>{aspects.map(([key, zh, en]) => <div className="ratingRow" key={key}><div><strong>{lang === "en" ? en : zh}</strong></div>{ratingOptions.map((rating) => <label key={rating} title={rating}><input type="radio" name={`rating-${key}`} checked={ratings[key] === rating} onChange={() => setRatings((old) => ({ ...old, [key]: rating }))} /><span>{rating}</span></label>)}</div>)}</div>

        <div className="openQuestions">
          <label><strong>{t("E3. 您对知识库内容、功能或 AI Agent 能力最满意的是哪一项？为什么？", "E3. Which knowledge-base content, function or AI Agent capability satisfied you most, and why?")}</strong><textarea value={e3} onChange={(event) => setE3(event.target.value)} /></label>
          <label><strong>{t("E4. 为了提高您的满意度，校园知识库或 AI Agent 最需要优先改进什么？", "E4. What should be improved first in the campus knowledge base or AI Agent to increase your satisfaction?")}</strong><textarea value={e4} onChange={(event) => setE4(event.target.value)} /></label>
          <label><strong>{t("E5. 您是否发现知识库中存在缺失、过期、重复或分类不准确的内容？请简要说明。", "E5. Did you find any missing, outdated, duplicated or incorrectly classified content in the knowledge base? Please briefly describe it.")}</strong><textarea value={e5} onChange={(event) => setE5(event.target.value)} /></label>
        </div>
      </>}

      <div className="surveyActions"><button disabled={!e1 || submitting} onClick={submitSurvey}>{submitting ? t("正在保存…", "Saving…") : t("提交原型体验问卷", "Submit prototype survey")}</button>{surveyNotice && <span>{surveyNotice}</span>}</div>
      <p className="storageNote">{storageMode === "supabase"
        ? t("当前通过服务端接口写入 Supabase，浏览器不会接触 service-role key。", "Responses are written to Supabase through the server API; the browser never receives the service-role key.")
        : t("当前未连接 Supabase，页面使用 localStorage 作为测试备用存储。正式多人研究采集前应配置 Supabase。", "Supabase is not connected, so localStorage is being used as a test fallback. Configure Supabase before formal multi-user data collection.")}</p>
    </section>
  </main>;
}
