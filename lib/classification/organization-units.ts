export const ORGANIZATION_UNIT_DEFINITIONS = [
  {
    key: "career-centre",
    labelZh: "就业与职业发展中心",
    labelEn: "Career Centre",
    accounts: ["西浦就业CareerCentre"],
  },
  {
    key: "admissions",
    labelZh: "招生办公室",
    labelEn: "Admissions",
    accounts: ["西浦招生"],
  },
  {
    key: "alumni-association",
    labelZh: "校友会",
    labelEn: "Alumni Association",
    accounts: ["西交利物浦大学校友会"],
  },
  {
    key: "university",
    labelZh: "西交利物浦大学",
    labelEn: "Xi'an Jiaotong-Liverpool University",
    accounts: ["西交利物浦大学"],
  },
  {
    key: "library",
    labelZh: "图书馆",
    labelEn: "Library",
    accounts: ["西交利物浦大学图书馆"],
  },
  {
    key: "student-services",
    labelZh: "学生服务",
    labelEn: "Student Services",
    accounts: ["西浦学生服务"],
  },
  {
    key: "graduate-school",
    labelZh: "研究生院",
    labelEn: "Graduate School",
    accounts: ["西交利物浦大学研究生院"],
  },
  {
    key: "ibss",
    labelZh: "西浦国际商学院",
    labelEn: "International Business School Suzhou",
    accounts: ["西交利物浦大学西浦国际商学院"],
  },
  {
    key: "design-school",
    labelZh: "设计学院",
    labelEn: "Design School",
    accounts: ["西交利物浦大学设计学院"],
  },
  {
    key: "hss",
    labelZh: "人文社科学院",
    labelEn: "School of Humanities and Social Sciences",
    accounts: ["西浦人文社科学院HSS"],
  },
  {
    key: "film-creative-tech",
    labelZh: "影视与创意科技学院",
    labelEn: "School of Film and Creative Technologies",
    accounts: ["西浦影视与创意科技学院"],
  },
  {
    key: "future-education",
    labelZh: "未来教育学院",
    labelEn: "Academy of Future Education",
    accounts: ["西浦未来教育学院"],
  },
  {
    key: "school-of-science",
    labelZh: "理学院",
    labelEn: "School of Science",
    accounts: ["西交利物浦大学理学院"],
  },
  {
    key: "wisdom-lake-pharmacy",
    labelZh: "慧湖药学院",
    labelEn: "Wisdom Lake Academy of Pharmacy",
    accounts: ["西浦慧湖药学院"],
  },
  {
    key: "school-of-intelligent-engineering",
    labelZh: "智能工程学院",
    labelEn: "School of Intelligent Engineering",
    accounts: ["西交利物浦大学智能工程学院"],
  },
  {
    key: "school-of-mathematics-physics",
    labelZh: "数学物理学院",
    labelEn: "School of Mathematics and Physics",
    accounts: ["西交利物浦大学数学物理学院"],
  },
  {
    key: "ai-advanced-computing",
    labelZh: "人工智能与先进计算学院",
    labelEn: "School of AI and Advanced Computing",
    accounts: ["西浦太仓人工智能与先进计算学院"],
  },
  {
    key: "ai-academy",
    labelZh: "AI学院",
    labelEn: "Academy of Artificial Intelligence",
    accounts: ["西浦AI学院 AOA"],
  },
] as const;

export type OrganizationUnitKey =
  (typeof ORGANIZATION_UNIT_DEFINITIONS)[number]["key"];

export type OrganizationUnitDefinition = {
  key: string;
  labelZh: string;
  labelEn: string;
  accounts: readonly string[];
};

export function buildOrganizationAccountMap(
  definitions: readonly OrganizationUnitDefinition[],
) {
  const accountMap = new Map<string, string>();
  for (const definition of definitions) {
    for (const account of definition.accounts) {
      if (accountMap.has(account)) {
        throw new Error(`Duplicate Organization Unit account alias: ${account}`);
      }
      accountMap.set(account, definition.key);
    }
  }
  return accountMap;
}

const ORGANIZATION_BY_ACCOUNT = buildOrganizationAccountMap(
  ORGANIZATION_UNIT_DEFINITIONS,
);

const ORGANIZATION_UNIT_KEYS = new Set<string>(
  ORGANIZATION_UNIT_DEFINITIONS.map((item) => item.key),
);

export function isOrganizationUnitKey(
  value: unknown,
): value is OrganizationUnitKey {
  return typeof value === "string" && ORGANIZATION_UNIT_KEYS.has(value);
}

export function organizationUnitForAccount(account: string) {
  return ORGANIZATION_BY_ACCOUNT.get(account) as OrganizationUnitKey | undefined;
}

export function organizationUnitCatalog() {
  return ORGANIZATION_UNIT_DEFINITIONS;
}

export const ACADEMIC_ORGANIZATION_UNITS = new Set<OrganizationUnitKey>([
  "ibss",
  "design-school",
  "hss",
  "film-creative-tech",
  "future-education",
  "school-of-science",
  "wisdom-lake-pharmacy",
  "school-of-intelligent-engineering",
  "school-of-mathematics-physics",
  "ai-advanced-computing",
  "ai-academy",
]);
