export const KNOWLEDGE_DOMAIN_DEFINITIONS = [
  {
    key: "careers-opportunities",
    labelZh: "就业与机会",
    labelEn: "Careers & Opportunities",
    description:
      "Employment, internships, recruitment, RA positions, scholarships, competitions/calls and other application-based opportunities.",
  },
  {
    key: "admissions-study",
    labelZh: "招生与学业",
    labelEn: "Admissions & Study",
    description:
      "Undergraduate/postgraduate admissions, programme information, academic affairs, curriculum/study-related information and graduate-school information.",
  },
  {
    key: "student-services-campus-life",
    labelZh: "学生服务与校园生活",
    labelEn: "Student Services & Campus Life",
    description:
      "Student affairs, campus life, administrative support, wellbeing, accommodation and general student services.",
  },
  {
    key: "library-academic-support",
    labelZh: "图书馆与学术支持",
    labelEn: "Library & Academic Support",
    description:
      "Library services, databases, learning resources, academic support and related services.",
  },
  {
    key: "university-affairs",
    labelZh: "学校综合事务",
    labelEn: "University-wide Information",
    description:
      "University-level policies, major institutional developments, university-wide information and general university affairs.",
  },
  {
    key: "schools-research",
    labelZh: "学院与科研动态",
    labelEn: "Schools & Research",
    description:
      "School/faculty activity, research, academic projects, disciplinary developments and school-level academic information.",
  },
  {
    key: "alumni-community",
    labelZh: "校友与社区",
    labelEn: "Alumni & Community",
    description:
      "Alumni affairs, alumni stories, alumni opportunities, community engagement and alumni-network information.",
  },
] as const;

export type KnowledgeDomainKey =
  (typeof KNOWLEDGE_DOMAIN_DEFINITIONS)[number]["key"];

const KNOWLEDGE_DOMAIN_KEYS = new Set<string>(
  KNOWLEDGE_DOMAIN_DEFINITIONS.map((item) => item.key),
);

export function isKnowledgeDomainKey(value: unknown): value is KnowledgeDomainKey {
  return typeof value === "string" && KNOWLEDGE_DOMAIN_KEYS.has(value);
}

export function knowledgeDomainCatalog() {
  return KNOWLEDGE_DOMAIN_DEFINITIONS;
}
