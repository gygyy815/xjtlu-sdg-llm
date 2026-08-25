import type { UiLang } from "./ui-i18n";

const PAIRS: Array<readonly [string, string]> = [
  ["西浦校园", "XJTLU Campus"],
  ["信息助手", "Information Assistant"],
  ["这里同时提供快速反馈和 AI Agent 原型体验问卷。请勿填写姓名、学号、邮箱或其他可识别个人的信息。", "This page provides quick feedback and the AI Agent prototype experience survey. Do not enter names, student IDs, email addresses or other personally identifiable information."],
  ["完整主问卷与线上知情同意仍应按照问卷星流程完成；本页嵌入的是专门面向“已体验 AI Agent 原型者”的 E 部分，便于在 Demo 体验后立即收集反馈。", "The full questionnaire and online informed consent should still be completed through WenJuanXing. This page embeds Section E specifically for participants who have used the AI Agent prototype, so feedback can be collected immediately after the Demo experience."],
  ["本机备用存储", "Local fallback storage"],
  ["检查存储…", "Checking storage…"],
  ["快速反馈", "Quick feedback"],
  ["原型问卷", "Prototype survey"],
  ["导出本机备份", "Export local backup"],
  ["研究流程提示", "Research process note"],
  ["快速记录问题或建议", "Quickly report an issue or suggestion"],
  ["反馈类型", "Feedback type"],
  ["具体内容", "Details"],
  ["提交快速反馈", "Submit quick feedback"],
  ["正在保存…", "Saving…"],
  ["校园知识库与 AI Agent 原型体验调查", "Campus Knowledge Base and AI Agent Prototype Experience Survey"],
  ["项已评分", "items rated"],
];

const zhToEn = new Map(PAIRS);
const enToZh = new Map(PAIRS.map(([zh, en]) => [en, zh] as const));

export function translateUiExactFix(value: string, lang: UiLang) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  return lang === "en" ? (zhToEn.get(trimmed) || value) : (enToZh.get(trimmed) || value);
}
