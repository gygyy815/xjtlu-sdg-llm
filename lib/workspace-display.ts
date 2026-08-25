import type { UiLang } from "./ui-i18n";

type WorkspaceNames = { zh: string; en: string; aliases?: string[] };

// User-facing knowledge-base names. English names follow XJTLU's official
// English naming where an institutional name is available; WeChat-brand names
// use a stable descriptive label rather than substring translation.
const WORKSPACE_NAMES: WorkspaceNames[] = [
  { zh: "全部公众号", en: "All official accounts", aliases: ["All official accounts"] },
  { zh: "产业家学院与和谐管理研究中心", en: "College of Industry-Entrepreneurs & HeXie Management Research Centre", aliases: ["CIE & HeXie Academy"] },
  { zh: "创业与企业港", en: "Entrepreneurship and Enterprise Hub" },
  { zh: "西交利物浦大学", en: "Xi'an Jiaotong-Liverpool University" },
  { zh: "西交利物浦大学图书馆", en: "XJTLU Library", aliases: ["XJTLU Library"] },
  { zh: "西交利物浦大学数学物理学院", en: "School of Mathematics and Physics" },
  { zh: "西交利物浦大学智能工程学院", en: "School of Advanced Technology" },
  { zh: "西交利物浦大学校友会", en: "XJTLU Alumni Association" },
  { zh: "西交利物浦大学理学院", en: "School of Science" },
  { zh: "西交利物大学研究生院", en: "XJTLU Graduate School", aliases: ["西交利物浦大学研究生院"] },
  { zh: "西交利物浦大学西浦国际商学院", en: "International Business School Suzhou", aliases: ["西浦国际商学院"] },
  { zh: "西交利物浦大学设计学院", en: "Design School" },
  { zh: "西浦AI学院 AOA", en: "Academy of Artificial Intelligence", aliases: ["西浦AI学院AOA"] },
  { zh: "西浦人文社科学院HSS", en: "School of Humanities and Social Sciences" },
  { zh: "西浦全球文化与语言学苑GCLH", en: "Global Cultures and Languages Hub" },
  { zh: "西浦太仓产金融合学院", en: "School of Intelligent Finance and Business" },
  { zh: "西浦太仓人工智能与先进计算学院", en: "School of AI and Advanced Computing" },
  { zh: "西浦太仓芯片", en: "School of CHIPS" },
  { zh: "西浦学生服务", en: "XJTLU Student Services", aliases: ["XJTLU Student Services"] },
  { zh: "西浦就业CareerCentre", en: "XJTLU Career Centre", aliases: ["西浦就业CareerCenter", "XJTLU Career Centre"] },
  { zh: "西浦影视与创意科技学院", en: "Academy of Film and Creative Technology" },
  { zh: "西浦慧湖药学院", en: "XJTLU Wisdom Lake Academy of Pharmacy" },
  { zh: "西浦招生", en: "XJTLU Admissions" },
  { zh: "西浦智能机器人", en: "School of Robotics" },
  { zh: "西浦智造生态", en: "School of Intelligent Manufacturing Ecosystem" },
  { zh: "西浦未来教育学院", en: "Academy of Future Education" },
  { zh: "西浦物联网工程", en: "School of Internet of Things" },
  { zh: "西浦管小理", en: "Self-Management WeChat Account" },
  { zh: "西浦集萃学院", en: "XJTLU-JITRI Academy of Industrial Technology", aliases: ["西浦-集萃学院"] },
];

const aliasToEntry = new Map<string, WorkspaceNames>();
for (const entry of WORKSPACE_NAMES) {
  aliasToEntry.set(entry.zh, entry);
  aliasToEntry.set(entry.en, entry);
  for (const alias of entry.aliases || []) aliasToEntry.set(alias, entry);
}

function normalizeMixedXjtluPrefix(value: string) {
  const prefix = "Xi'an Jiaotong-Liverpool University";
  if (value.startsWith(prefix) && value.length > prefix.length) {
    return `西交利物浦大学${value.slice(prefix.length)}`;
  }
  return value;
}

export function canonicalWorkspaceLabel(value: string) {
  const trimmed = String(value || "").trim();
  if (!trimmed) return "";
  const normalized = normalizeMixedXjtluPrefix(trimmed);
  return aliasToEntry.get(normalized)?.zh || normalized;
}

export function workspaceDisplayLabel(value: string, lang: UiLang) {
  const canonical = canonicalWorkspaceLabel(value);
  const entry = aliasToEntry.get(canonical);
  if (!entry) return canonical;
  return lang === "en" ? entry.en : entry.zh;
}
