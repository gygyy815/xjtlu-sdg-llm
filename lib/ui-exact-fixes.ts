import type { UiLang } from "./ui-i18n";

// High-priority exact pairs for pages where mixed-language source copy must flip
// cleanly in both directions. Keep knowledge/article/user content out of this list.
const PAIRS: Array<readonly [string, string]> = [
  ["西浦校园", "XJTLU Campus"],
  ["信息助手", "Information Assistant"],
  ["反馈与原型体验", "FEEDBACK & PROTOTYPE EXPERIENCE"],
  ["这里同时提供快速反馈和 AI Agent 原型体验问卷。请勿填写姓名、学号、邮箱或其他可识别个人的信息。", "This page provides quick feedback and the AI Agent prototype experience survey. Do not enter names, student IDs, email addresses or other personally identifiable information."],
  ["完整主问卷与线上知情同意仍应按照问卷星流程完成；本页嵌入的是专门面向“已体验 AI Agent 原型者”的 E 部分，便于在 Demo 体验后立即收集反馈。", "The full questionnaire and online informed consent should still be completed through WenJuanXing. This page embeds Section E specifically for participants who have used the AI Agent prototype, so feedback can be collected immediately after the Demo experience."],
  ["Supabase 已连接", "Supabase connected"],
  ["本机备用存储", "Local fallback storage"],
  ["检查存储…", "Checking storage…"],
  ["快速反馈", "Quick feedback"],
  ["原型问卷", "Prototype survey"],
  ["导出本机备份", "Export local backup"],
  ["研究流程提示", "Research process note"],
  ["快速记录问题或建议", "Quickly report an issue or suggestion"],
  ["反馈类型", "Feedback type"],
  ["功能建议", "Feature suggestion"],
  ["知识库问题", "Knowledge-base issue"],
  ["回答质量", "Answer quality"],
  ["界面体验", "Interface experience"],
  ["具体内容", "Details"],
  ["例如：知识图谱全屏后希望支持按活动类型筛选…", "For example: add event-type filtering in Knowledge Graph fullscreen mode…"],
  ["提交快速反馈", "Submit quick feedback"],
  ["正在保存…", "Saving…"],
  ["已提交至研究反馈数据库。感谢你的建议。", "Submitted to the research feedback database. Thank you for your suggestion."],
  ["Supabase 尚未配置，本次反馈已保存在当前浏览器。", "Supabase is not configured, so this feedback was saved in the current browser."],
  ["远程保存暂时不可用，本次反馈已安全保存在当前浏览器。", "Remote storage is temporarily unavailable, so this feedback was safely saved in the current browser."],
  ["校园知识库与 AI Agent 原型体验调查", "Campus Knowledge Base and AI Agent Prototype Experience Survey"],
  ["项已评分", "items rated"],
  ["填写前，请先完成以下体验：提出一个校园信息问题；进行一次追问或修改问题；打开回答中的一条原文链接；查看回答中的来源、日期或有效状态说明（如有）。", "Before completing this section, ask one campus-information question, make one follow-up or revision, open one original link, and review source/date/validity information if available."],
  ["E1. 您是否已经按照上述要求与 AI Agent 原型进行交互？", "E1. Have you interacted with the AI Agent prototype as described above?"],
  ["是，我已经完成上述操作（继续 E2–E5）", "Yes, I completed the tasks above (continue to E2–E5)"],
  ["否，我还没有完成上述操作（结束问卷）", "No, I have not completed the tasks above (end the survey)"],
  ["按照原问卷逻辑，选择“否”后无需继续 E2–E5，可直接保存本次记录。", "Following the original survey logic, if you select “No”, you do not need to continue to E2–E5 and can save this response directly."],
  ["E2. 您对以下方面的满意程度如何？", "E2. How satisfied are you with the following aspects?"],
  ["1=非常不满意 · 2=不满意 · 3=一般 · 4=满意 · 5=非常满意 · N/A=不适用", "1=Very dissatisfied · 2=Dissatisfied · 3=Neutral · 4=Satisfied · 5=Very satisfied · N/A=Not applicable"],
  ["评价项目 / Aspect", "Aspect"],
  ["整体使用体验", "Overall experience"],
  ["知识库内容的覆盖范围与相关性", "Coverage and relevance of knowledge-base content"],
  ["知识库分类与标签的清晰度", "Clarity of knowledge-base categories and tags"],
  ["SDG 或主题识别的准确性", "Accuracy of SDG or topic recognition"],
  ["原文链接、官方来源和发布日期的清晰度", "Clarity of original links, official sources and publication dates"],
  ["对信息是否仍有效或存在不确定性的说明", "Explanation of whether information is still valid or uncertain"],
  ["打开原微信公众号文章的便利性", "Ease of opening the original WeChat article"],
  ["中英文内容与翻译支持", "Chinese-English content and translation support"],
  ["AI Agent 理解问题的准确性", "Accuracy of the AI Agent in understanding the question"],
  ["回答与问题的相关性", "Relevance of the answer to the question"],
  ["回答内容的准确性与可信度", "Accuracy and trustworthiness of the answer"],
  ["回答内容的完整性", "Completeness of the answer"],
  ["回答表达的简洁与清晰程度", "Clarity and conciseness of the answer"],
  ["长文章要点、截止时间或行动步骤的提炼", "Extraction of key points, deadlines or action steps"],
  ["连续追问与上下文理解", "Follow-up questions and context understanding"],
  ["回答速度", "Response speed"],
  ["知识图谱或相关内容推荐（如已使用）", "Knowledge-graph or related-content recommendations (if used)"],
  ["E3. 您对知识库内容、功能或 AI Agent 能力最满意的是哪一项？为什么？", "E3. Which knowledge-base content, function or AI Agent capability satisfied you most, and why?"],
  ["E4. 为了提高您的满意度，校园知识库或 AI Agent 最需要优先改进什么？", "E4. What should be improved first in the campus knowledge base or AI Agent to increase your satisfaction?"],
  ["E5. 您是否发现知识库中存在缺失、过期、重复或分类不准确的内容？请简要说明。", "E5. Did you find any missing, outdated, duplicated or incorrectly classified content in the knowledge base? Please briefly describe it."],
  ["提交原型体验问卷", "Submit prototype experience survey"],
  ["已提交至研究反馈数据库。", "Submitted to the research feedback database."],
  ["Supabase 尚未配置，本次原型体验问卷已保存在当前浏览器。", "Supabase is not configured, so this prototype survey was saved in the current browser."],
  ["远程保存暂时不可用，本次问卷已安全保存在当前浏览器。", "Remote storage is temporarily unavailable, so this survey was safely saved in the current browser."],
];

const zhToEn = new Map(PAIRS);
const enToZh = new Map(PAIRS.map(([zh, en]) => [en, zh] as const));

export function translateUiExactFix(value: string, lang: UiLang) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  return lang === "en" ? (zhToEn.get(trimmed) || value) : (enToZh.get(trimmed) || value);
}
