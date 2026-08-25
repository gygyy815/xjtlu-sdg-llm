import type { UiLang } from "./ui-i18n";

type WorkspaceName = { zh: string; en: string };

// Canonical labels for the 28 official-account sources plus the all-sources view.
// Academic unit names follow XJTLU's official English naming. Account-only brands
// keep a stable descriptive/transliterated label instead of partial machine translation.
const WORKSPACE_NAMES: Record<string, WorkspaceName> = {
  "全部公众号": { zh: "全部公众号", en: "All official accounts" },
  "产业家学院与和谐管理研究中心": { zh: "产业家学院与和谐管理研究中心", en: "College of Industry-Entrepreneurs (CIE) & HeXie Management Research Centre (HeXie Academy)" },
  "创业与企业港": { zh: "创业与企业港", en: "Entrepreneurship and Enterprise Hub" },
  "西交利物浦大学": { zh: "西交利物浦大学", en: "Xi'an Jiaotong-Liverpool University" },
  "西交利物浦大学图书馆": { zh: "西交利物浦大学图书馆", en: "XJTLU Library" },
  "西交利物浦大学数学物理学院": { zh: "西交利物浦大学数学物理学院", en: "School of Mathematics and Physics" },
  "西交利物浦大学智能工程学院": { zh: "西交利物浦大学智能工程学院", en: "School of Advanced Technology" },
  "西交利物浦大学校友会": { zh: "西交利物浦大学校友会", en: "XJTLU Alumni Association" },
  "西交利物浦大学理学院": { zh: "西交利物浦大学理学院", en: "School of Science" },
  "西交利物浦大学研究生院": { zh: "西交利物浦大学研究生院", en: "XJTLU Graduate School" },
  "西交利物浦大学西浦国际商学院": { zh: "西交利物浦大学西浦国际商学院", en: "International Business School Suzhou" },
  "西交利物浦大学设计学院": { zh: "西交利物浦大学设计学院", en: "Design School" },
  "西浦AI学院 AOA": { zh: "西浦AI学院 AOA", en: "Academy of Artificial Intelligence (AOA)" },
  "西浦人文社科学院HSS": { zh: "西浦人文社科学院HSS", en: "School of Humanities and Social Sciences (HSS)" },
  "西浦全球文化与语言学苑GCLH": { zh: "西浦全球文化与语言学苑GCLH", en: "Global Cultures and Languages Hub (GCLH)" },
  "西浦太仓产金融合学院": { zh: "西浦太仓产金融合学院", en: "School of Intelligent Finance and Business" },
  "西浦太仓人工智能与先进计算学院": { zh: "西浦太仓人工智能与先进计算学院", en: "School of AI and Advanced Computing" },
  "西浦太仓芯片": { zh: "西浦太仓芯片", en: "School of CHIPS" },
  "西浦学生服务": { zh: "西浦学生服务", en: "XJTLU Student Services" },
  "西浦就业CareerCentre": { zh: "西浦就业CareerCentre", en: "XJTLU Career Centre" },
  "西浦影视与创意科技学院": { zh: "西浦影视与创意科技学院", en: "Academy of Film and Creative Technology" },
  "西浦慧湖药学院": { zh: "西浦慧湖药学院", en: "XJTLU Wisdom Lake Academy of Pharmacy" },
  "西浦招生": { zh: "西浦招生", en: "XJTLU Admissions" },
  "西浦智能机器人": { zh: "西浦智能机器人", en: "School of Robotics" },
  "西浦智造生态": { zh: "西浦智造生态", en: "School of Intelligent Manufacturing Ecosystem" },
  "西浦未来教育学院": { zh: "西浦未来教育学院", en: "Academy of Future Education" },
  "西浦物联网工程": { zh: "西浦物联网工程", en: "School of Internet of Things" },
  "西浦管小理": { zh: "西浦管小理", en: "XJTLU Guan Xiaoli (WeChat)" },
  "西浦集萃学院": { zh: "西浦集萃学院", en: "XJTLU-JITRI Academy of Industrial Technology" },
};

const SLUG_ALIASES: Record<string, string> = {
  "xjtlu-all-sources": "全部公众号",
  "43274168-84dc-4b6c-a62a-85773b4ed3cf": "西交利物浦大学",
  "xjtlu-sdg": "西交利物浦大学图书馆",
  "xjtlu-student-affairs": "西浦学生服务",
};

const EN_TO_ZH = new Map(Object.values(WORKSPACE_NAMES).map((item) => [item.en, item.zh]));

export function canonicalWorkspaceZh(label: string, slug?: string) {
  const bySlug = slug ? SLUG_ALIASES[slug] : undefined;
  if (bySlug) return bySlug;
  const trimmed = label.trim();
  if (WORKSPACE_NAMES[trimmed]) return trimmed;
  return EN_TO_ZH.get(trimmed) || trimmed;
}

export function workspaceDisplayName(label: string, slug: string | undefined, lang: UiLang) {
  const zh = canonicalWorkspaceZh(label, slug);
  const entry = WORKSPACE_NAMES[zh];
  if (!entry) return label;
  return lang === "en" ? entry.en : entry.zh;
}

export const OFFICIAL_WORKSPACE_NAMES = WORKSPACE_NAMES;
