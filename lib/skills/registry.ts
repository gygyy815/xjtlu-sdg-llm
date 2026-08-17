export type SkillId =
  | "knowledge-graph"
  | "file-fill"
  | "article-summary"
  | "activity-extract"
  | "validity-check"
  | "translation";

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
];

export function getSkill(id: unknown) {
  return skillRegistry.find((skill) => skill.id === id);
}
