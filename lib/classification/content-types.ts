export const CONTENT_TYPE_DEFINITIONS = [
  {
    key: "activity",
    labelZh: "活动",
    labelEn: "Activity",
    description:
      "Lectures, workshops, seminars, training, competitions treated as scheduled participation events, and other time-bounded events.",
  },
  {
    key: "notice",
    labelZh: "通知",
    labelEn: "Notice",
    description:
      "Administrative announcements, operational notices, reminders, deadlines and updates requiring awareness or action.",
  },
  {
    key: "guide",
    labelZh: "指南",
    labelEn: "Guide",
    description:
      "Procedures, service instructions, how-to information, process explanations and durable informational guidance.",
  },
  {
    key: "opportunity",
    labelZh: "机会",
    labelEn: "Opportunity",
    description:
      "Jobs, internships, RA positions, scholarships, recruitment, calls for applications, selection-based opportunities and similar openings.",
  },
  {
    key: "news",
    labelZh: "新闻",
    labelEn: "News",
    description:
      "Retrospective reporting, completed-event recaps, profiles, institutional developments and general news reporting.",
  },
  {
    key: "other",
    labelZh: "其他",
    labelEn: "Other",
    description:
      "Content positively identified as outside the other approved primary types, such as ceremonial greetings or clearly editorial series; never a fallback for uncertain content.",
  },
] as const;

export type ContentTypeKey =
  (typeof CONTENT_TYPE_DEFINITIONS)[number]["key"];

const CONTENT_TYPE_KEYS = new Set<string>(
  CONTENT_TYPE_DEFINITIONS.map((item) => item.key),
);

export function isContentTypeKey(value: unknown): value is ContentTypeKey {
  return typeof value === "string" && CONTENT_TYPE_KEYS.has(value);
}

export function contentTypeCatalog() {
  return CONTENT_TYPE_DEFINITIONS;
}
