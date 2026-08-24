import { NextResponse } from "next/server";
import { AnythingLLMError, askAnythingLLM, resolveWorkspaceSlug, vectorSearchAnythingLLM } from "@/lib/anythingllm";
import { getSkill } from "@/lib/skills/registry";

function activeCustomSkill(request: Request) {
  const cookie = request.headers.get("cookie") || "";
  const raw = cookie.split(";").map((part) => part.trim()).find((part) => part.startsWith("xjtlu_active_custom_skill="))?.split("=").slice(1).join("=");
  if (!raw) return null;
  try {
    const parsed = JSON.parse(decodeURIComponent(raw));
    if (!parsed?.name || !parsed?.prompt) return null;
    return { name: String(parsed.name).slice(0, 80), prompt: String(parsed.prompt).slice(0, 2600) };
  } catch {
    return null;
  }
}

function campusToday() {
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date());
  const values = Object.fromEntries(parts.map((part) => [part.type, part.value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function isTimeSensitiveActivityQuery(message: string, skillId: unknown) {
  if (skillId === "validity-check" || skillId === "activity-extract") return true;
  return /(近期|最近|可以参加|可参加|还能参加|尚未过期|未过期|报名|截止|活动推荐|推荐.*活动|upcoming|recent|can\s+i\s+(?:join|attend)|still\s+open|registration|deadline|available\s+event)/i.test(message);
}

function temporalGuard(message: string, skillId: unknown) {
  if (!isTimeSensitiveActivityQuery(message, skillId)) return "";
  const today = campusToday();
  return `
[时效性校验规则 / TEMPORAL VALIDITY GUARD]
当前校内日期（Asia/Shanghai）：${today}。
本次问题涉及“近期 / 可参加 / 报名 / 有效性”，必须先做日期校验，再决定是否推荐。

必须遵守：
1. 明确区分：文章发布日期、活动开始日期、活动结束日期、报名截止日期。不得把文章发布日期当成活动日期。
2. 只有在文档明确证明“活动尚未结束，并且报名/参与窗口尚未关闭”时，才能描述为“可以参加 / 可报名 / upcoming / available”。
3. 活动结束日期早于 ${today}，或报名截止日期早于 ${today}：必须排除出“可参加活动”推荐；如用户需要，可放到“已过期信息”中单独说明。
4. 如果活动日期只有“6月17日”这类不含年份的信息，不得自行补成年份，也不得据此声称它仍可参加。此类结果标为“无法确认当前有效性”，不要作为首选推荐。
5. 如果只有发布日期而没有明确活动日期/截止日期，同样不能声称“近期可参加”。
6. 如果日期相互冲突，指出冲突并判定“无法确认”，不要选一个日期猜测。
7. 对每个最终推荐项必须列出：活动日期、报名截止（若有）、有效状态、判断依据、来源。
8. 如果检索结果中没有任何能够明确证明仍可参加的活动，直接说明“当前知识库中未找到可明确确认仍可参加的活动”，不要为了给出答案而推荐过期活动。
`;
}

export async function POST(request: Request) {
  try {
    const { message, account, workspaceSlug, sessionId, skillId, agentMode } = await request.json();
    const slug = resolveWorkspaceSlug(account, workspaceSlug);
    if (!message?.trim()) return NextResponse.json({ error: "请输入问题。" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "当前知识库没有可用的 AnythingLLM Workspace。" }, { status: 400 });

    const builtIn = getSkill(skillId);
    const custom = builtIn ? null : activeCustomSkill(request);
    const guard = temporalGuard(String(message), skillId);
    const baseTask = builtIn?.prompt
      ? `${guard}\n[技能：${builtIn.name}]\n${builtIn.prompt}\n\n[用户问题]\n${message}`
      : custom
        ? `${guard}\n[自定义技能：${custom.name}]\n${custom.prompt}\n\n[用户问题]\n${message}`
        : guard
          ? `${guard}\n[用户问题]\n${message}`
          : message;
    const task = agentMode ? `@agent ${baseTask}` : baseTask;

    const topN = 6;
    const threshold = 0.2;
    const retrievalJob = vectorSearchAnythingLLM(slug, String(message), topN, threshold)
      .then((results) => ({ results, warning: "" }))
      .catch((error) => ({
        results: [],
        warning: error instanceof Error ? error.message : "Vector-search diagnostic failed.",
      }));

    const [result, retrieval] = await Promise.all([
      askAnythingLLM(slug, task, "query", sessionId),
      retrievalJob,
    ]);

    return NextResponse.json({
      ...result,
      activeSkill: builtIn?.name || custom?.name || null,
      skillSource: builtIn ? "builtin" : custom ? "custom" : null,
      temporalGuardApplied: Boolean(guard),
      retrieval: {
        query: String(message),
        workspace: slug,
        topN,
        threshold,
        retrievedCount: retrieval.results.length,
        usedCount: result.citations.length,
        results: retrieval.results,
        warning: retrieval.warning || undefined,
      },
    });
  } catch (error) {
    const status = error instanceof AnythingLLMError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "请求失败。" }, { status });
  }
}
