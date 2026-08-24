export const ANSWER_SYNTHESIS_VERSION = "1.0";

function compact(value: string) {
  return String(value || "").replace(/\s+/g, " ").trim();
}

export function isDerivedClassificationQuestion(question: string) {
  return /\bSDG\b|建议分类|分类|classif/i.test(question);
}

export function explicitReferenceDate(question: string) {
  const zh = question.match(/(?:截至|截止到|截止至|截至到)\s*(20\d{2}年\s*\d{1,2}月\s*\d{1,2}日)/i)?.[1];
  if (zh) return compact(zh);
  const iso = question.match(/(?:as\s+of|by)\s+(20\d{2}[-\/]\d{1,2}[-\/]\d{1,2})/i)?.[1];
  return iso ? compact(iso) : "";
}

export function answerSynthesisInstruction(question: string, intent?: string) {
  const rows = [
    `\n[Answer Synthesis ${ANSWER_SYNTHESIS_VERSION}]`,
    "先依据证据完成事实覆盖，再组织自然语言答案。不得为了简短而省略用户明确要求的独立项目、字段或目标。",
  ];

  const referenceDate = explicitReferenceDate(question);
  if (referenceDate) {
    rows.push(`用户明确指定的判断基准日期是 ${referenceDate}。所有“已结束/未结束/有效/失效”结论都必须与这个日期比较；回答理由中不得改用系统当前日期。`);
  }

  if (intent === "aggregate") {
    rows.push("这是聚合/列表型问题：先逐一检查证据中的不同文章或项目，再回答。凡与问题直接相关且有正文证据的独立项目都应保留；不要只挑少数代表项。相同项目可合并，明显无关的项目应排除。 ");
  }

  if (/(培训|参与机会|机会|招募|征集|竞赛|比赛|夏令营|training|workshop|opportunit|competition|recruit)/i.test(question)) {
    rows.push("对于培训或参与机会汇总，要分别检查培训/工作坊、竞赛或征集、夏令营/实践项目、招募/社团参与等类型。若证据中存在多个不同培训或机会，应逐项列出，不能因为已经列出一个培训就省略其他明确培训。 ");
  }

  if (isDerivedClassificationQuestion(question)) {
    rows.push("这是派生分类任务：SDG 标签是根据正文证据提出的“建议分类”，不是要求来源原文必须出现标签。每个正向标签都必须紧跟具体行动、项目、政策、服务或可验证成果证据。仅在否定句中出现某个 SDG（例如“未明确与 SDG 12 相关”）不算对该 SDG 的正向分类。不得仅凭“教育”“创新”“可持续”等泛化词做分类。 ");
  }

  return rows.join("\n");
}
