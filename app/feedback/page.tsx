"use client";

import { useEffect, useMemo, useState } from "react";
import { useProductLanguage } from "@/lib/product-language";

const QUICK_KEY = "xjtlu-feedback-v2";
const SURVEY_KEY = "xjtlu-prototype-survey-e-v1";

type Feedback = { id: string; type: string; message: string; createdAt: string };
type SurveyRecord = { id: string; createdAt: string; consent: boolean; main: Record<string, string | string[]>; e1: "yes" | "no" | ""; ratings: Record<string, string>; e3: string; e4: string; e5: string };
type SurveyOption = readonly [string, string, string];
type ChoiceQuestion = { id: string; zh: string; en: string; type: "single" | "multi"; max?: number; options: readonly SurveyOption[]; conditional?: "nonChinese" };

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

const consentItems = [
  ["read", "我已阅读并理解上述研究信息。", "I have read and understood the study information above."],
  ["adult", "我确认自己年满 18 周岁，并属于西浦学生或教职员工。", "I confirm that I am aged 18 or over and am an XJTLU student or staff member."],
  ["voluntary", "我理解参与完全自愿，可在提交前随时退出或跳过非必答题。", "I understand that participation is voluntary and I may leave before submission or skip non-required questions."],
  ["privacy", "我不会在开放题或 AI Agent 对话中填写姓名、学号、邮箱或其他可识别个人的信息。", "I will not enter identifying information in open-text responses or AI Agent conversations."],
  ["verification", "我理解 AI Agent 回答可能不完整或不准确，应通过原文链接核对官方信息。", "I understand that AI Agent answers may be incomplete or inaccurate and should be checked against official sources."],
] as const;

const choiceQuestions: ChoiceQuestion[] = [
  { id: "q1", zh: "1. 您的身份是？", en: "1. What is your role at XJTLU?", type: "single", options: [["undergraduate","本科生","Undergraduate student"],["postgraduate","研究生（包括博士生）","Postgraduate student (including PhD students)"],["faculty","教师","Faculty member"],["staff","行政/教辅人员","Administrative/support staff"],["other","其他","Other"],["prefer-not","不愿透露","Prefer not to say"]] },
  { id: "q2", zh: "2. 您的第一语言是？", en: "2. What is your first language?", type: "single", options: [["chinese","中文","Chinese"],["english","英文","English"],["other","其他","Other"],["prefer-not","不愿透露","Prefer not to say"]] },
  { id: "q3", zh: "3. 本学期以来，您浏览校园微信公众号内容的频率大概是？", en: "3. During this semester, how often have you viewed campus WeChat official account content?", type: "single", options: [["weekly","基本每周都会看（每周至少 1 次）","Usually every week (at least once a week)"],["occasionally","偶尔会看（本学期看过几次）","Occasionally (a few times this semester)"],["rarely","很少看，或者基本不看","Rarely or not at all"]] },
  { id: "q4", zh: "4. 您在获取或回找校园微信公众号信息时遇到过哪些问题？", en: "4. What problems have you encountered when accessing or finding campus WeChat information again?", type: "multi", max: 5, options: [["scattered","公众号太多，信息分散，不知道重点关注哪一个","Too many accounts and scattered information"],["long","文章太长，难以快速找到重点、截止时间或报名方式","Posts are too long to find key points quickly"],["keywords","只记得大概内容，想不起标题或关键词","I cannot recall the title or right keywords"],["find-again","以前看过，但需要时很难找回来","Previously seen information is difficult to find again"],["expired","找到后才发现过期或原链接失效","Information is outdated or the original link no longer works"],["duplicates","不同账号内容重复，无关信息较多","Duplicate and irrelevant content across accounts"],["official","不确定是否官方或现在是否仍有效","Uncertain whether information is official or still valid"],["language","中英文内容或翻译支持不足","Chinese-English content or translation support is insufficient"],["none","目前没有明显问题","No significant problems"],["other","其他","Other"]] },
  { id: "q5", zh: "5. 您最希望知识库优先收录哪些类型的信息？", en: "5. What information should the knowledge base include first?", type: "multi", max: 5, options: [["campus-events","社团活动或校园活动","Student club or campus activities"],["academic-events","仍可报名的讲座、会议、比赛或培训","Lectures, conferences, competitions or training still open"],["research","简短科研动态","Concise research updates"],["career","奖学金、实习或就业机会","Scholarships, internships or jobs"],["policies","学校政策、办事流程和联系方式","Policies, procedures and contacts"],["sdg","可持续发展或 SDG 项目","Sustainability or SDG projects"],["school-notices","学院、部门或校区通知","School, department or campus notices"],["other","其他","Other"]] },
  { id: "q6", zh: "6. 您希望通过哪些方式组织、检索或筛选信息？", en: "6. How should information be organised, searched or filtered?", type: "multi", max: 6, options: [["cross-account","用大概关键词跨公众号搜索","Approximate keyword search across accounts"],["sdg-topic","按 SDG 或主题浏览","Browse by SDG or topic"],["department","按学院或部门筛选","Filter by school or department"],["campus","按校区筛选","Filter by campus"],["relevance","筛选与自己有关的信息","Filter information relevant to me"],["account","查看某个公众号的全部内容","View all content from one account"],["type","按活动、政策、科研等类型筛选","Filter by content type"],["date","按发布时间或截止时间筛选","Filter by publication date or deadline"],["validity","有效信息优先并标记过期内容","Prioritise valid information and mark expired content"],["language","筛选中文、英文或双语内容","Filter Chinese, English or bilingual content"],["other","其他","Other"]] },
  { id: "q7", zh: "7. 如果可以通过 AI Agent 查询知识库，您最希望完成哪些任务？", en: "7. Which tasks would you most want to complete with an AI Agent?", type: "multi", max: 5, options: [["chat","像聊天一样直接提问并获得简明回答","Ask conversational questions and receive concise answers"],["sdg","查询某个 SDG 的近期活动或文章","Find recent activities or posts for an SDG"],["narrow","先搜索全校，再按学院、校区、来源或时间缩小范围","Search university-wide then narrow the results"],["club-events","查询本月可参加的社团活动","Find student club activities available this month"],["academic-events","查询可以参加的学术活动","Find academic events open for participation"],["research-summary","用几句话总结近期科研动态","Summarise recent research updates"],["evidence","查看原文链接、来源、日期和有效性","See original links, sources, dates and validity"],["bilingual","中英文提问并对照原文和翻译","Ask bilingually and compare original text and translation"],["other","其他","Other"]] },
  { id: "q8", zh: "8. 如果您的第一语言不是中文，获取校园微信公众号内容时遇到过哪些困难？", en: "8. If your first language is not Chinese, what difficulties have you encountered?", type: "multi", conditional: "nonChinese", options: [["understand","部分中文内容难以理解","Some Chinese content is difficult to understand"],["no-english","很多文章没有英文版","Many posts have no English version"],["inconsistent","中英文版本不一致或翻译不准确","Chinese and English versions are inconsistent or inaccurate"],["relevance","不确定信息是否与自己有关","Uncertain whether the information applies to me"],["late","英文版发布较晚或内容不完整","English versions are late or incomplete"],["none","目前没有明显困难","No significant difficulties"],["other","其他","Other"]] },
  { id: "q9", zh: "9. 您认为知识库最应优先提供哪些信息与功能？", en: "9. Which information and functions should the knowledge base prioritise?", type: "multi", max: 5, options: [["source","原文链接、官方来源和发布日期","Original links, official sources and publication dates"],["actions","参与对象、截止时间和行动步骤","Eligibility, deadlines and action steps"],["validity","有效状态和最近核验时间","Validity status and last checked time"],["tags","统一的 SDG、主题、学院、校区和人群标签","Consistent SDG, topic, school, campus and audience tags"],["bilingual","中英文切换并保留原文和翻译来源","Bilingual switching with original and translation sources"],["dedupe","合并重复内容并连接后续更新","Merge duplicates and connect later updates"],["graph","知识图谱展示文章、活动、部门与 SDG 关系","Knowledge graph for articles, activities, departments and SDGs"],["subscribe","按公众号、主题或关键词订阅","Subscribe by account, topic or keyword"],["other","其他","Other"]] },
  { id: "q10", zh: "10. 您希望 AI Agent 具备哪些回答与辅助能力？", en: "10. Which response and support capabilities should the AI Agent have?", type: "multi", max: 4, options: [["context","理解自然表达和连续追问","Understand natural language and follow-up questions"],["extract","提炼重点、截止时间和操作步骤","Extract key points, deadlines and action steps"],["evidence","每个回答提供链接、来源、日期和依据","Provide links, sources, dates and evidence"],["uncertainty","资料不足或过期时明确说明，不进行猜测","State uncertainty rather than guess"],["translation","中英文转换并保留原文","Translate while preserving original text"],["recommend","推荐少量真正相关的内容","Recommend a few genuinely relevant items"],["other","其他","Other"]] },
  { id: "q11", zh: "11. 如果学校提供该知识库与 AI Agent，您的使用意愿如何？", en: "11. How willing would you be to use this knowledge base and AI Agent?", type: "single", options: [["very","非常愿意（会主动使用）","Very willing"],["quite","比较愿意（有需要时使用）","Quite willing"],["depends","要看具体任务","It depends on the task"],["not-much","不太愿意","Not very willing"],["not-at-all","完全不愿意","Not willing at all"]] },
];

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
  const [consent, setConsent] = useState<Record<string, boolean>>({});
  const [consentDecision, setConsentDecision] = useState<"" | "agree" | "decline">("");
  const [mainAnswers, setMainAnswers] = useState<Record<string, string | string[]>>({});

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
  const mainSurveyComplete = useMemo(() => {
    const visibleQuestions = choiceQuestions.filter((question) => question.conditional !== "nonChinese" || mainAnswers.q2 === "english" || mainAnswers.q2 === "other");
    const choicesComplete = visibleQuestions.every((question) => {
      const answer = mainAnswers[question.id];
      return question.type === "single" ? typeof answer === "string" && Boolean(answer) : Array.isArray(answer) && answer.length > 0;
    });
    return choicesComplete && typeof mainAnswers.q12 === "string" && Boolean(mainAnswers.q12.trim());
  }, [mainAnswers]);

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
    const consentComplete = consentItems.every(([key]) => consent[key]) && consentDecision === "agree";
    if (!consentComplete || !mainSurveyComplete || submitting) return;
    const record: SurveyRecord = {
      id: `survey-${Date.now()}`,
      createdAt: new Date().toISOString(),
      consent: true,
      main: mainAnswers,
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
      setConsent({});
      setConsentDecision("");
      setMainAnswers({});
    } catch {
      const count = saveLocal(SURVEY_KEY, record);
      setStorageMode("local");
      setSurveyCount(count);
      setSurveyNotice(t("远程保存暂时不可用，本次问卷已安全保存在当前浏览器。", "Remote storage is temporarily unavailable. This survey was saved in the current browser."));
    } finally {
      setSubmitting(false);
    }
  }

  function chooseMain(id: string, value: string, type: "single" | "multi", max?: number) {
    setMainAnswers((current) => {
      if (type === "single") return { ...current, [id]: value };
      const selected = Array.isArray(current[id]) ? current[id] as string[] : [];
      if (selected.includes(value)) return { ...current, [id]: selected.filter((item) => item !== value) };
      if (value === "none") return { ...current, [id]: ["none"] };
      const withoutExclusive = selected.filter((item) => item !== "none");
      if (max && withoutExclusive.length >= max) return current;
      return { ...current, [id]: [...withoutExclusive, value] };
    });
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
      <div className="sectionHead"><div><span>RESEARCH SURVEY</span><h2>{t("校园微信公众号知识库需求与 AI Agent 原型体验调查", "Survey on Campus WeChat Knowledge Base Needs and AI Agent Prototype Experience")}</h2></div></div>
      <div className="consentIntro"><strong>{t("参与者信息与线上知情同意", "Participant information and online informed consent")}</strong><p>{t("本研究旨在了解西浦师生获取校园微信公众号信息时遇到的困难，并评估校园知识库及 AI Agent 原型。主问卷约 8–10 分钟，原型体验部分约 3–5 分钟。参与完全自愿，不要求姓名、学号或邮箱；匿名提交后通常无法撤回个人回答。AI Agent 的回答可能不完整或不准确，请通过原文链接核对官方信息。如有问题，请联系 Dr Ying Chang：Ying.Chang@xjtlu.edu.cn。", "This study explores difficulties encountered by XJTLU students and staff when accessing campus WeChat information and evaluates the campus knowledge base and AI Agent prototype. The main survey takes about 8–10 minutes and the prototype section about 3–5 minutes. Participation is voluntary; no name, student ID or email is requested, and anonymous responses normally cannot be withdrawn after submission. AI Agent answers may be incomplete or inaccurate, so check official sources through original links. Contact: Dr Ying Chang, Ying.Chang@xjtlu.edu.cn.")}</p></div>
      <fieldset className="consentChecklist"><legend>{t("请确认全部项目", "Please confirm every item")}</legend>{consentItems.map(([key, zh, en]) => <label key={key}><input type="checkbox" checked={Boolean(consent[key])} onChange={(event) => setConsent((current) => ({ ...current, [key]: event.target.checked }))} /> {lang === "en" ? en : zh}</label>)}</fieldset>
      <fieldset><legend>{t("您是否同意参加本研究？", "Do you agree to take part in this study?")}</legend><label><input type="radio" name="consent" checked={consentDecision === "agree"} onChange={() => setConsentDecision("agree")} /> {t("我同意参加并继续填写问卷。", "I agree to take part and continue.")}</label><label><input type="radio" name="consent" checked={consentDecision === "decline"} onChange={() => setConsentDecision("decline")} /> {t("我不同意参加。（结束问卷）", "I do not agree to take part. (End survey)")}</label></fieldset>

      {consentDecision === "decline" && <div className="surveyEnd">{t("感谢你的考虑。由于你选择不同意，问卷在此结束，不会提交任何回答。", "Thank you for considering participation. Because you declined, the survey ends here and no response will be submitted.")}</div>}

      {consentDecision === "agree" && consentItems.every(([key]) => consent[key]) && <div className="mainSurveyQuestions">
        {choiceQuestions.filter((question) => question.conditional !== "nonChinese" || mainAnswers.q2 === "english" || mainAnswers.q2 === "other").map((question) => {
          const selected = mainAnswers[question.id];
          const hasOther = selected === "other" || (Array.isArray(selected) && selected.includes("other"));
          return <fieldset key={question.id}><legend>{lang === "en" ? question.en : question.zh}{question.max ? <small>{t(`最多选择 ${question.max} 项`, `Select up to ${question.max}`)}</small> : null}</legend>{question.options.map(([value, zh, en]) => <label key={value}><input type={question.type === "single" ? "radio" : "checkbox"} name={question.type === "single" ? question.id : undefined} checked={question.type === "single" ? selected === value : Array.isArray(selected) && selected.includes(value)} onChange={() => chooseMain(question.id, value, question.type, question.max)} /> {lang === "en" ? en : zh}</label>)}{hasOther && <input className="surveyOtherInput" value={typeof mainAnswers[`${question.id}_other`] === "string" ? mainAnswers[`${question.id}_other`] as string : ""} onChange={(event) => setMainAnswers((current) => ({ ...current, [`${question.id}_other`]: event.target.value }))} placeholder={t("请简要说明", "Please specify")} />}</fieldset>;
        })}
        <label className="surveyOpenQuestion"><strong>{t("12. 您认为校园微信公众号知识库最需要优先解决的一个问题是什么？", "12. What is the single most important problem the campus WeChat knowledge base should solve first?")}</strong><textarea value={typeof mainAnswers.q12 === "string" ? mainAnswers.q12 : ""} onChange={(event) => setMainAnswers((current) => ({ ...current, q12: event.target.value }))} /></label>
        <label className="surveyOpenQuestion"><strong>{t("13. 您对知识库或其 AI Agent 还有其他建议吗？（选答）", "13. Do you have any other suggestions for the knowledge base or its AI Agent? (Optional)")}</strong><textarea value={typeof mainAnswers.q13 === "string" ? mainAnswers.q13 : ""} onChange={(event) => setMainAnswers((current) => ({ ...current, q13: event.target.value }))} /></label>
      </div>}

      {consentDecision === "agree" && consentItems.every(([key]) => consent[key]) && <div className="prototypeSurveySection">
      <div className="sectionHead"><div><span>SECTION E</span><h2>{t("AI Agent 原型体验调查（仅限已体验者）", "AI Agent Prototype Experience Survey (for users who tested it)")}</h2></div><strong>{t(`${ratedCount}/${aspects.length} 项已评分`, `${ratedCount}/${aspects.length} rated`)}</strong></div>
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

      </div>}

      <div className="surveyActions"><button disabled={consentDecision !== "agree" || !consentItems.every(([key]) => consent[key]) || !mainSurveyComplete || submitting} onClick={submitSurvey}>{submitting ? t("正在保存…", "Saving…") : t("提交完整问卷", "Submit full survey")}</button>{consentDecision === "agree" && !mainSurveyComplete && <span>{t("请完成主问卷的所有必答题（Q1–Q12）。", "Please complete all required main-survey questions (Q1–Q12).")}</span>}{surveyNotice && <span>{surveyNotice}</span>}</div>
      <p className="storageNote">{storageMode === "supabase"
        ? t("当前通过服务端接口写入 Supabase，浏览器不会接触 service-role key。", "Responses are written to Supabase through the server API; the browser never receives the service-role key.")
        : t("当前未连接 Supabase，页面使用 localStorage 作为测试备用存储。正式多人研究采集前应配置 Supabase。", "Supabase is not connected, so localStorage is being used as a test fallback. Configure Supabase before formal multi-user data collection.")}</p>
    </section>
  </main>;
}
