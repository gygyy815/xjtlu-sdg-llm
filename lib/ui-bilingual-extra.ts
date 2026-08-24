import type { UiLang } from "./ui-i18n";

// Supplemental pairs for routes that still contain English-first or long-form UI copy.
// Knowledge-base/user/LLM content is intentionally excluded; this file is UI chrome only.
const pairs: Array<readonly [string, string]> = [
  ["PRIVATE HISTORY · CURRENT BROWSER", "私有历史 · 当前浏览器"],
  ["My chat history", "我的对话历史"],
  ["Current mode: anonymous browser-level isolation", "当前模式：匿名浏览器级隔离"],
  ["Suitable for current user testing: different devices or browser profiles have separate histories. This is not a formal account login; people sharing the same browser profile will still share history. For a formal multi-user version, connect Supabase Auth or the university identity system.", "适合当前用户测试：不同设备或浏览器配置拥有独立历史。这并不是正式账号登录；共用同一浏览器配置的人仍会共享历史。正式多人版本可接入 Supabase Auth 或学校统一身份认证。"],
  ["History messages", "历史消息"],
  ["Browser sessions", "浏览器会话"],
  ["All knowledge bases", "全部知识库"],
  ["Refresh", "刷新"],
  ["Why are older global AnythingLLM Threads no longer shown?", "为什么现在不再显示旧的全局 AnythingLLM Thread？"],
  ["FEEDBACK & PROTOTYPE EXPERIENCE", "反馈与原型体验"],
  ["Feedback", "反馈与建议"],
  ["This page provides quick feedback and the AI Agent prototype experience survey. Do not enter names, student IDs, email addresses or other personally identifiable information.", "本页提供快速反馈和 AI Agent 原型体验问卷。请勿填写姓名、学号、邮箱或其他可识别个人的信息。"],
  ["Research process note", "研究流程提示"],
  ["The full questionnaire and online informed consent should still be completed through WenJuanXing. This page embeds Section E specifically for participants who have used the AI Agent prototype, so feedback can be collected immediately after the Demo experience.", "完整主问卷与线上知情同意仍应通过问卷星完成。本页嵌入专门面向已体验 AI Agent 原型参与者的 E 部分，便于在 Demo 体验后立即收集反馈。"],
  ["QUICK FEEDBACK", "快速反馈"],
  ["Quickly report an issue or suggestion", "快速记录问题或建议"],
  ["Feedback type", "反馈类型"],
  ["Feature suggestion", "功能建议"],
  ["Details", "具体内容"],
  ["Submit quick feedback", "提交快速反馈"],
  ["Campus Knowledge Base and AI Agent Prototype Experience Survey", "校园知识库与 AI Agent 原型体验调查"],
  ["Settings", "设置"],
  ["Interface, privacy and system configuration", "界面、隐私与系统配置"],
  ["Browser preferences are stored locally. Server-side configuration such as AnythingLLM and Supabase is checked only for whether it is configured; secrets are never shown to the frontend.", "浏览器偏好保存在本机；AnythingLLM、Supabase 等服务器配置只检查是否已配置，不会向前端展示密钥。"],
  ["Collapse Skill Center by default", "默认收起技能中心"],
  ["Useful on smaller screens or when you want a wider chat area.", "适合小屏幕或希望聊天区域更宽的场景。"],
  ["Compact interface", "紧凑界面"],
  ["Reserved for a denser card and navigation layout.", "为后续压缩卡片间距和导航密度预留。"],
  ["Remember last skill", "记住上次技能"],
  ["Can restore the most recently used skill in a later version.", "后续可用于恢复最近使用的技能。"],
  ["Show evidence first", "优先展示证据"],
  ["Prioritise sources and publication dates in answer cards for verifiable use cases.", "回答卡片优先展示来源与发布时间，适合可核查场景。"],
  ["SYSTEM CHECK", "系统检查"],
  ["Which items still require manual configuration?", "哪些项目还需要手动配置？"],
  ["Private chat history", "私有对话历史"],
  ["Server article repository", "服务器文章仓库"],
  ["No configuration required while sync is paused", "同步暂停时无需配置"],
  ["Knowledge base", "知识库"],
  ["Knowledge base status:", "知识库状态："],
  ["Connected", "已连接"],
  ["Browse articles →", "浏览文章 →"],
  ["Find upcoming events", "查找近期活动"],
  ["Extract event details", "提取活动信息"],
  ["Check validity", "检查信息有效性"],
  ["Summarize article", "生成文章摘要"],
  ["Ask about campus information…", "输入你想了解的校园信息…"],
  ["Agent mode", "Agent 模式"],
  ["Skills", "技能"],
  ["Send", "发送"],
  ["New chat", "新建对话"],
  ["Chat history", "对话历史"],
  ["Browse knowledge", "浏览知识"],
  ["Back to assistant", "返回助手"],
  ["Export local backup", "导出本机备份"],
  ["Supabase connected", "Supabase 已连接"],
  ["Current browser", "当前浏览器"],
];

const zhToEn = new Map(pairs.map(([en, zh]) => [zh, en]));
const enToZh = new Map(pairs);

function replaceSegments(value: string, direction: "zh-en" | "en-zh") {
  const sourcePairs = direction === "zh-en"
    ? pairs.map(([en, zh]) => [zh, en] as const)
    : pairs;
  let output = value;
  let changed = false;
  for (const [from, to] of [...sourcePairs].sort((a, b) => b[0].length - a[0].length)) {
    if (!from || !output.includes(from)) continue;
    output = output.split(from).join(to);
    changed = true;
  }
  return changed ? output : value;
}

export function translateUiBidirectional(value: string, lang: UiLang) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (lang === "zh") {
    const exact = enToZh.get(trimmed);
    return exact ?? replaceSegments(trimmed, "en-zh");
  }
  const exact = zhToEn.get(trimmed);
  return exact ?? replaceSegments(trimmed, "zh-en");
}
