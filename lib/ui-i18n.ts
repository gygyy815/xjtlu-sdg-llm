export type UiLang = "zh" | "en";

const dictionary: Record<string, string> = {
  "新建对话": "New chat",
  "对话历史": "Chat history",
  "浏览知识": "Browse knowledge",
  "知识库管理": "Knowledge bases",
  "数据看板": "Dashboard",
  "反馈与建议": "Feedback",
  "设置": "Settings",
  "知识库": "Knowledge base",
  "知识库状态：": "Knowledge base status: ",
  "已连接": "Connected",
  "未配置": "Not configured",
  "浏览文章 →": "Browse articles →",
  "可核查校园知识助手": "Verifiable campus knowledge assistant",
  "检索文章、提取活动信息、生成关系图并填写文件": "Search articles, extract events, build relationship maps and fill files",
  "所有知识类回答基于当前 AnythingLLM 中实际存在的 Workspace；缺少明确证据时不推测。": "Knowledge answers are grounded in the active AnythingLLM workspace; unsupported details are not guessed.",
  "查找近期活动": "Find upcoming events",
  "提取活动信息": "Extract event details",
  "检查信息有效性": "Check validity",
  "生成文章摘要": "Summarize article",
  "选择右侧技能，然后输入你的问题。": "Choose a skill on the right, then enter your question.",
  "知识图谱会抽取活动、部门、受众、地点与时间；文件填写会先识别字段再让你确认。": "Knowledge Graph extracts events, departments, audiences, places and time; File Fill detects fields before asking you to confirm.",
  "输入你想了解的校园信息…": "Ask about campus information…",
  "拖动输入框右下角可调整高度": "Drag the lower-right corner to resize",
  "文件": "File",
  "Agent 模式": "Agent mode",
  "发送": "Send",
  "本次会话概览": "Session overview",
  "对话请求": "Chat requests",
  "文件处理": "Files processed",
  "Token 用量将在接入模型 usage 统计后显示，当前不估算。": "Token usage will be shown after model usage metrics are connected; no estimate is shown now.",

  "技能中心": "Skill Center",
  "清除": "Clear",
  "选择一个技能后，它会作为当前对话的执行方式。PPT 制作与思维导图会进入专用可视化工具页。": "Choose a skill to set how the current conversation should run. PPT Builder and Mind Map open dedicated visual tools.",
  "搜索技能": "Search skills",
  "创建新技能": "Create skill",
  "导入技能": "Import skill",
  "官方技能": "Built-in",
  "我的技能": "My skills",
  "已导入": "Imported",
  "内置": "Built-in",
  "导入": "Imported",
  "自建": "Custom",
  "收起": "Collapse",
  "技能": "Skills",
  "滚动查看更多技能": "Scroll for more skills",
  "知识图谱": "Knowledge Graph",
  "文件填写": "File Fill",
  "文章摘要": "Article Summary",
  "活动信息提取": "Event Extraction",
  "信息有效性检查": "Validity Check",
  "中英双语": "Bilingual Output",
  "知识图解": "Knowledge Explainer",
  "PPT 制作": "PPT Builder",
  "学习模式": "Learning Mode",
  "思维导图": "Mind Map",
  "从检索文章中抽取活动、部门、受众、地点与时间，并生成关系图。": "Extract events, departments, audiences, places and time from retrieved articles and build a relationship graph.",
  "识别 Word / Excel 模板字段，确认后基于知识库生成可复核文件。": "Detect Word / Excel template fields, confirm them, then generate a reviewable file from the knowledge base.",
  "生成结构化摘要，保留关键日期、名称、数字与原文链接。": "Create a structured summary while preserving key dates, names, numbers and source links.",
  "提取活动名称、时间、地点、对象、资格、报名与联系方式。": "Extract event name, time, place, audience, eligibility, registration and contact details.",
  "依据发布日期、活动日期与截止日期判断信息是否仍有效。": "Check validity using publication, event and deadline dates.",
  "生成准确的中英文版本，并保持关键事实不变。": "Generate accurate Chinese and English versions while preserving key facts.",
  "把复杂校园信息拆成核心概念、关系、步骤与易懂解释。": "Break complex campus information into concepts, relationships, steps and clear explanations.",
  "进入专用工具，根据知识库证据生成可下载、可继续编辑的 .pptx。": "Open a dedicated tool to build a downloadable, editable .pptx from knowledge-base evidence.",
  "通过讲解、追问、小测与纠错帮助用户掌握知识库内容。": "Use explanations, follow-up questions, quizzes and corrections to help users learn knowledge-base content.",
  "进入专用可视化工具，用 Markmap 生成可展开思维导图并支持 SVG / Markdown 导出。": "Open the visual tool to create an expandable Markmap mind map with SVG / Markdown export.",

  "返回助手": "Back to assistant",
  "用 Markmap 展示可展开的校园知识结构": "Use Markmap to explore expandable campus knowledge structures",
  "AnythingLLM 负责从真实知识库提取和组织信息；开源 Markmap 负责专业的思维导图布局、缩放、拖动与节点折叠。这样语义抽取和可视化各自做最擅长的部分。": "AnythingLLM extracts and organizes grounded knowledge; open-source Markmap handles mind-map layout, zooming, panning and node folding so each layer does what it does best.",
  "例如：近期校园活动、职业发展服务、图书馆资源使用流程…": "For example: upcoming campus events, career services, library resource workflows…",
  "生成思维导图": "Generate mind map",
  "正在生成…": "Generating…",
  "适应视图": "Fit view",
  "放大": "Zoom in",
  "缩小": "Zoom out",
  "展开层级": "Expand level",
  "全部": "All",
  "全屏": "Fullscreen",
  "导出 SVG": "Export SVG",
  "导出 Markdown": "Export Markdown",
  "来源证据未返回": "No source evidence returned",
  "本次 AnythingLLM / 向量检索没有返回可展示的来源元数据。": "AnythingLLM / vector search did not return displayable source metadata for this run.",
  "交互提示": "Interaction",
  "滚轮缩放": "Mouse-wheel zoom",
  "拖动画布": "Drag to pan",
  "点击节点圆点展开/折叠": "Click node circles to expand/collapse",
  "导图中的 S1/S2 与下方来源列表一一对应": "S1/S2 markers in the map match the source list below",
  "SVG 可直接用于报告或继续编辑": "SVG can be used directly in reports or edited further",
  "参考来源": "Sources",
  "查看原文 ↗": "Open source ↗",
  "本次检索没有返回可展示来源。建议确认 Workspace 文档是否包含来源元数据，或稍后重试。": "No displayable sources were returned. Check whether Workspace documents contain source metadata or try again later.",

  "基于知识库证据生成可下载的演示文稿": "Generate downloadable presentations from knowledge-base evidence",
  "新版先独立检索多个证据来源，再生成逐页结构，并用 PptxGenJS 输出标准 .pptx。对于“近期 / 可参加”等时效主题，会按照当前日期检查活动日期与报名截止日期，避免把已结束活动包装成当前机会。": "The new version retrieves multiple evidence sources first, plans slides, and uses PptxGenJS to generate a standard .pptx. Time-sensitive topics such as “upcoming / can I join” are checked against event and registration dates so expired events are not presented as current opportunities.",
  "总页数（含封面与来源）": "Total slides (including cover and sources)",
  "语言": "Language",
  "中文": "Chinese",
  "汇报主题 / 要求": "Presentation topic / requirements",
  "例如：近期校园活动。请只展示当前仍可参加或可明确确认有效的活动，并标注日期、地点、对象与来源。": "For example: upcoming campus events. Show only events that are still joinable or clearly verified as valid, with dates, places, audiences and sources.",
  "生成 PPTX": "Generate PPTX",
  "正在检索、校验时效并生成 PPT…": "Retrieving evidence, checking validity and building PPT…",
  "这里填写的是最终总页数。例如输入 4，系统会生成 1 页封面 + 2 页内容 + 1 页参考来源，共 4 页，不会再额外增加页数。": "This is the final slide count. Entering 4 produces 1 cover + 2 content slides + 1 sources slide, for exactly 4 slides.",
  "暂时无法生成": "Unable to generate",
  "下载 PPTX": "Download PPTX",
  "多路检索证据": "Multi-query evidence retrieval",
  "先用 AnythingLLM Vector Search 扩大来源覆盖，避免整份 PPT 被单一文章主导。": "Use AnythingLLM Vector Search to broaden evidence coverage and avoid letting one article dominate the whole deck.",
  "日期有效性检查": "Date validity checks",
  "“近期 / 可参加”主题会区分发布日期、活动日期与报名截止日期。": "“Upcoming / can I join” topics distinguish publication, event and registration deadline dates.",
  "PptxGenJS 排版": "PptxGenJS layout",
  "根据内容选择项目符号、双栏、时间线或核心结论等布局。": "Choose bullets, two-column, timeline or key-takeaway layouts based on content.",
  "固定总页数": "Exact total slide count",
  "封面与来源页已经包含在你填写的总页数中。": "The cover and sources slide are already included in the total you enter.",

  "我的对话历史": "My chat history",
  "我的历史会话": "My conversations",
  "历史消息": "History messages",
  "本机 Session": "Browser sessions",
  "来源引用": "Source citations",
  "全部知识库": "All knowledge bases",
  "刷新": "Refresh",
  "当前用户还没有可显示的历史会话。": "No history is available for this browser user yet.",
  "界面与交互偏好": "Interface & interaction preferences",
  "默认收起技能中心": "Collapse Skill Center by default",
  "紧凑界面": "Compact interface",
  "记住上次技能": "Remember last skill",
  "优先展示证据": "Show evidence first",
};

function withIconPrefix(value: string) {
  const match = value.match(/^([＋+◷▤▣▥◇⚙⇧↻⌕✓]+)\s*(.+)$/u);
  if (!match) return null;
  const translated = dictionary[match[2]];
  return translated ? `${match[1]} ${translated}` : null;
}

export function translateUiText(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return value;

  const official = trimmed.match(/^官方技能\s*\((\d+)\)$/);
  if (official) return `Built-in (${official[1]})`;
  const mine = trimmed.match(/^我的技能\s*\((\d+)\)$/);
  if (mine) return `My skills (${mine[1]})`;
  const imported = trimmed.match(/^已导入\s*\((\d+)\)$/);
  if (imported) return `Imported (${imported[1]})`;
  const sourceCount = trimmed.match(/^来源证据\s*(\d+)$/);
  if (sourceCount) return `Source evidence ${sourceCount[1]}`;
  const status = trimmed.match(/^知识库状态：\s*(已连接|未配置)$/);
  if (status) return `Knowledge base status: ${status[1] === "已连接" ? "Connected" : "Not configured"}`;

  return dictionary[trimmed] || withIconPrefix(trimmed) || trimmed;
}
