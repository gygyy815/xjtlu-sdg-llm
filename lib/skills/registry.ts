export type SkillId =
  | "knowledge-graph"
  | "file-fill"
  | "article-summary"
  | "activity-extract"
  | "validity-check"
  | "translation"
  | "knowledge-explainer"
  | "ppt-maker"
  | "learning-mode"
  | "mind-map";

export type SkillDefinition = {
  id: SkillId;
  name: string;
  description: string;
  icon: string;
  kind: "chat" | "graph" | "file";
  prompt?: string;
};

export const skillRegistry: SkillDefinition[] = [
  {
    id: "knowledge-graph",
    name: "知识图谱",
    description: "从检索文章中抽取活动、部门、受众、地点与时间，并生成关系图。",
    icon: "◉",
    kind: "graph",
  },
  {
    id: "file-fill",
    name: "文件填写",
    description: "识别 Word / Excel 模板字段，确认后基于知识库生成可复核文件。",
    icon: "▦",
    kind: "file",
  },
  {
    id: "article-summary",
    name: "文章摘要",
    description: "生成结构化摘要，保留关键日期、名称、数字与原文链接。",
    icon: "▤",
    kind: "chat",
    prompt:
      "请总结最相关的知识库文章。区分核心内容、重要日期、参与步骤、注意事项与来源。日期、数字、人名、邮箱和 URL 必须按原文保留；证据不足时写“文档未明确说明”。",
  },
  {
    id: "activity-extract",
    name: "活动信息提取",
    description: "提取活动名称、时间、地点、对象、资格、报名与联系方式。",
    icon: "⌖",
    kind: "chat",
    prompt:
      "请从最相关的文章中提取活动名称、活动日期、时间、地点、参与对象、资格条件、报名截止、报名方式、联系方式、主办/负责部门和原文链接。不得把发布日期当作活动日期，不得推断缺失信息。",
  },
  {
    id: "validity-check",
    name: "信息有效性检查",
    description: "依据发布日期、活动日期与截止日期判断信息是否仍有效。",
    icon: "✓",
    kind: "chat",
    prompt:
      "请检查检索结果的时效性。明确区分文章发布日期、活动日期与报名截止日期，并据此判断“有效 / 已过期 / 无法确定”。每个判断都要给出原文依据；证据不足时不要猜测。",
  },
  {
    id: "translation",
    name: "中英双语",
    description: "生成准确的中英文版本，并保持关键事实不变。",
    icon: "文",
    kind: "chat",
    prompt:
      "请生成准确的中文和英文版本。日期、数字、姓名、机构名、邮箱和 URL 必须保持原文事实不变；不要为了语言流畅而补充未在文档中出现的信息。",
  },
  {
    id: "knowledge-explainer",
    name: "知识图解",
    description: "把复杂校园信息拆成核心概念、关系、步骤与易懂解释。",
    icon: "✧",
    kind: "chat",
    prompt:
      "请仅基于当前知识库检索证据，把用户询问的主题做成易理解的知识图解。输出：①一句话结论；②3-6个核心概念；③概念之间的关系；④如涉及流程则给出步骤；⑤容易混淆或需要注意的地方；⑥来源。不要补充知识库没有明确支持的事实。",
  },
  {
    id: "ppt-maker",
    name: "PPT 制作",
    description: "根据知识库证据生成逐页 PPT 结构、要点与演讲提示。",
    icon: "▣",
    kind: "chat",
    prompt:
      "请根据当前知识库证据为用户生成可直接用于制作 PPT 的逐页方案。先给出受众与汇报目标，再按页输出：页码、标题、3-5个要点、建议视觉元素、演讲提示、对应来源。默认控制在6-10页；如果用户指定页数则遵循。不要虚构数据、案例或引用。当前技能生成的是PPT内容方案，不要声称已经生成.pptx文件。",
  },
  {
    id: "learning-mode",
    name: "学习模式",
    description: "通过讲解、追问、小测与纠错帮助用户掌握知识库内容。",
    icon: "↗",
    kind: "chat",
    prompt:
      "进入学习模式。仅基于当前知识库内容教学。先用简洁语言解释主题，再提出1-3个递进问题检查理解；根据用户回答继续提示、纠错或提高难度。需要时给出一个小测验和答案解析。不要一次把所有答案全部展开，也不要引入知识库之外的事实。",
  },
  {
    id: "mind-map",
    name: "思维导图",
    description: "把检索内容整理成层级清晰、可继续编辑的思维导图。",
    icon: "⌘",
    kind: "chat",
    prompt:
      "请仅基于当前知识库检索结果生成思维导图。使用清晰的 Markdown 层级树：中心主题 → 一级分支 → 二级要点；优先按主题/部门/活动/时间/受众/行动步骤组织，不适用的分支省略。每个节点尽量短，不要把长段落直接塞进节点。最后附上对应来源列表。",
  },
];

export function getSkill(id: unknown) {
  return skillRegistry.find((skill) => skill.id === id);
}
