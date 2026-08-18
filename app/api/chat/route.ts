import { NextResponse } from "next/server";
import { AnythingLLMError, askAnythingLLM, resolveWorkspaceSlug } from "@/lib/anythingllm";
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

export async function POST(request: Request) {
  try {
    const { message, account, workspaceSlug, sessionId, skillId, agentMode } = await request.json();
    const slug = resolveWorkspaceSlug(account, workspaceSlug);
    if (!message?.trim()) return NextResponse.json({ error: "请输入问题。" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "当前知识库没有可用的 AnythingLLM Workspace。" }, { status: 400 });

    const builtIn = getSkill(skillId);
    const custom = builtIn ? null : activeCustomSkill(request);
    const baseTask = builtIn?.prompt
      ? `[技能：${builtIn.name}]\n${builtIn.prompt}\n\n[用户问题]\n${message}`
      : custom
        ? `[自定义技能：${custom.name}]\n${custom.prompt}\n\n[用户问题]\n${message}`
        : message;
    const task = agentMode ? `@agent ${baseTask}` : baseTask;

    const result = await askAnythingLLM(slug, task, "query", sessionId);
    return NextResponse.json({ ...result, activeSkill: builtIn?.name || custom?.name || null, skillSource: builtIn ? "builtin" : custom ? "custom" : null });
  } catch (error) {
    const status = error instanceof AnythingLLMError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "请求失败。" }, { status });
  }
}
