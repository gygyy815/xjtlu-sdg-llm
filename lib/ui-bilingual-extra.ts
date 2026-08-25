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
  ["Knowledge Base Management", "知识库管理"],
  ["KNOWLEDGE BASE MANAGEMENT", "知识库管理"],
  ["Configured Workspaces, official-account sources and server article sync centre", "正式 Workspace、公众号来源与服务器文章同步中心"],
  ["Refresh status", "刷新状态"],
  ["View dashboard →", "查看数据看板 →"],
  ["Demo Workspaces", "Demo Workspace"],
  ["Server articles", "服务器文章"],
  ["Pending AnythingLLM import", "待导入 AnythingLLM"],
  ["Official accounts awaiting confirmation", "待确认公众号"],
  ["Official knowledge bases available in the Demo", "Demo 中可选的正式知识库"],
  ["Official-account source identification and Workspace policy", "公众号来源识别与 Workspace 策略"],
  ["Server → AnythingLLM incremental sync", "服务器 → AnythingLLM 增量同步"],
  ["Connected", "已连接"],
  ["Not connected", "未连接"],

  ["Knowledge base status:", "知识库状态："],
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
  ["Icon", "图标"],
  ["Art", "插画"],

  ["All official accounts", "全部公众号"],
  ["Xi'an Jiaotong-Liverpool University", "西交利物浦大学"],
  ["XJTLU Library", "西交利物浦大学图书馆"],
  ["XJTLU Student Services", "西浦学生服务"],
  ["Choose a knowledge base", "选择知识库"],
  ["Search knowledge bases…", "搜索知识库…"],
  ["No matching knowledge base", "没有匹配的知识库"],
  ["Hello, what can I help you with?", "你好，我可以为你做些什么？"],

  ["My conversations", "我的对话"],
  ["Recent activity", "最近使用"],
  ["Continue your previous campus questions", "继续之前的校园问答"],
  ["Search questions you asked recently, or continue with a knowledge base you used before.", "搜索你最近问过的问题，或从之前使用过的知识库继续查询。"],
  ["Search my questions or answers…", "搜索我的问题或回答…"],
  ["Reading your recent conversations…", "正在读取你的最近对话…"],
  ["No conversation history yet", "还没有历史记录"],
  ["Start a conversation on the home page and your recent questions will appear here.", "从首页开始一次对话后，你最近的问答会显示在这里。"],
  ["Continue this question", "继续这个问题"],
  ["Privacy tip", "隐私提示"],
  ["This Demo keeps history within the current browser session. On a public computer, close the browser or clear site data when you finish.", "当前 Demo 的历史按浏览器会话保存。使用公共电脑时，完成体验后建议关闭浏览器或清理站点数据。"],

  ["My preferences", "我的偏好"],
  ["Make the campus assistant work the way you prefer", "把校园助手调整成你更顺手的样子"],
  ["These settings only affect display and usage preferences in this browser and do not expose your personal information.", "这些设置只影响当前浏览器中的显示和使用习惯，不会公开你的个人信息。"],
  ["Collapse skills by default", "默认收起技能"],
  ["Keep the chat interface simple and open skills only when needed.", "保持聊天界面更简洁，需要时再从输入框打开技能。"],
  ["Compact display", "紧凑显示"],
  ["Reduce spacing on some cards and content, which is useful on smaller screens.", "减少部分卡片与内容间距，适合较小的屏幕。"],
  ["Remember the last used skill", "记住上次使用的技能"],
  ["Keep your most recently selected tool preference for the next visit.", "下次继续使用时，保留你最近选择的工具偏好。"],
  ["Show source evidence first", "优先展示来源证据"],
  ["Prioritise sources, dates and verifiable information in answers.", "回答中优先显示来源、日期和可核查信息。"],
  ["Privacy", "隐私说明"],
  ["Your current Demo records stay within this browser", "你的当前 Demo 记录只保存在本浏览器范围内"],
  ["Conversation history and some tool records are isolated to the current browser session. Do not enter passwords, identification numbers or unnecessary sensitive information in the Demo.", "对话历史与部分工具记录按当前浏览器会话隔离。不要在 Demo 中输入密码、证件号码或其他不必要的敏感信息。"],
  ["View my conversations →", "查看我的对话 →"],
  ["Share feedback →", "反馈使用体验 →"],

  ["Campus knowledge bases", "校园知识库"],
  ["Search and choose the knowledge base you want to use", "搜索并选择你想查询的知识库"],
  ["Search by official account, department or Workspace name. After you choose one, the assistant will prioritise that knowledge base for your questions.", "你可以按公众号名称、部门名称或 Workspace 名称搜索。选择后，助手会优先使用该知识库回答问题。"],
  ["Search knowledge bases, for example: Library, Student Services, All official accounts…", "搜索知识库，例如：图书馆、学生服务、全部公众号…"],
  ["No matching knowledge base was found.", "没有找到匹配的知识库。"],
  ["Choose →", "选择 →"],
  ["Not sure which one to choose?", "不知道选哪个？"],
  ["Choose “All official accounts” for cross-source search. If you only care about a department or official account, choosing that knowledge base is usually more precise.", "选择“全部公众号”可以进行跨来源搜索；如果你只关心某个部门或公众号，选择对应知识库通常会更精准。"],
  ["Return to the assistant →", "返回助手直接提问 →"],
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
