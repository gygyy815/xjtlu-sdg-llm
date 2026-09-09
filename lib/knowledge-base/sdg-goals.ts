import type { SdgTag } from "./types";

export const SDG_GOALS = [
  { value: "1", label: "SDG 1 无贫穷" },
  { value: "2", label: "SDG 2 零饥饿" },
  { value: "3", label: "SDG 3 良好健康与福祉" },
  { value: "4", label: "SDG 4 优质教育" },
  { value: "5", label: "SDG 5 性别平等" },
  { value: "6", label: "SDG 6 清洁饮水和卫生设施" },
  { value: "7", label: "SDG 7 经济适用的清洁能源" },
  { value: "8", label: "SDG 8 体面工作和经济增长" },
  { value: "9", label: "SDG 9 产业、创新和基础设施" },
  { value: "10", label: "SDG 10 减少不平等" },
  { value: "11", label: "SDG 11 可持续城市和社区" },
  { value: "12", label: "SDG 12 负责任消费和生产" },
  { value: "13", label: "SDG 13 气候行动" },
  { value: "14", label: "SDG 14 水下生物" },
  { value: "15", label: "SDG 15 陆地生物" },
  { value: "16", label: "SDG 16 和平、正义与强大机构" },
  { value: "17", label: "SDG 17 促进目标实现的伙伴关系" },
] as const;

const SDG_GOAL_VALUES = new Set<string>(SDG_GOALS.map(({ value }) => value));

export function normalizeSdgGoal(value: string | undefined) {
  const normalized = value?.trim().replace(/^SDG\s*/i, "") ?? "";
  return SDG_GOAL_VALUES.has(normalized) ? normalized : "";
}

export function sdgCodeMatchesGoal(code: string, goal: string) {
  const normalizedGoal = normalizeSdgGoal(goal);
  if (!normalizedGoal) return false;
  const match = code.trim().match(/^SDG\s*0*(\d+)(?:\.|$)/i);
  return match?.[1] === normalizedGoal;
}

export function formatSdgCode(code: string) {
  const normalized = code.trim().replace(/^SDG\s*/i, "");
  return normalized ? `SDG ${normalized}` : code.trim();
}

export function visibleArticleSdgTags(sdgTags: readonly SdgTag[] | undefined) {
  return sdgTags?.slice(0, 3) ?? [];
}
