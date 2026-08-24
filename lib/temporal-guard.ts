export function campusToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

export function isTimeSensitiveActivityQuery(message: string, skillId?: unknown) {
  if (skillId === "validity-check" || skillId === "activity-extract") return true;
  return /(近期|最近|可以参加|可参加|还能参加|尚未过期|未过期|报名|截止|活动推荐|推荐.*活动|已经结束|已结束|过期|失效|有效性|之前.*结束|upcoming|recent|can\s+i\s+(?:join|attend)|still\s+open|registration|deadline|expired|ended|validity|available\s+event)/i.test(message);
}

export function temporalGuard(message: string, skillId?: unknown) {
  if (!isTimeSensitiveActivityQuery(message, skillId)) return "";
  const today = campusToday();
  return `
[时效性校验规则 / TEMPORAL VALIDITY GUARD]
当前校内日期（Asia/Shanghai）：${today}。
本次问题涉及活动日期、过期、近期、可参加、报名或有效性判断。必须仅依据检索文档中的明确日期进行判断。

必须遵守：
1. 明确区分文章发布日期、活动开始日期、活动结束日期、报名截止日期。不得把文章发布日期当成活动日期。
2. 用户给出明确判断基准日期时，以用户给出的日期为准；否则以当前校内日期 ${today} 为准。
3. 只有文档明确给出活动/报名日期时，才能判断已结束、仍有效、可参加或已过期。
4. 不得用“通常”“一般”“大概”“暑假通常到某月”等常识补全文档没有写出的结束时间。
5. 如果日期只有“6月17日”这类不含年份的信息，不得自行补成年份；应说明无法确认对应年份。
6. 如果只有发布日期而没有活动日期/截止日期，不得据发布日期推断活动已经结束或仍有效。
7. 如果日期相互冲突，指出冲突并判定“无法确认”，不要自行选择一个日期。
8. 对最终列出的每个活动，说明判断依据所使用的原文日期字段。
9. 如果检索结果不足以支持判断，直接说明“文档未明确说明”，不要为了完成列表而猜测。
`;
}

export function applyTemporalGuard(message: string, skillId?: unknown) {
  const guard = temporalGuard(message, skillId);
  return {
    guard,
    task: guard ? `${guard}\n[用户问题]\n${message}` : message,
  };
}
