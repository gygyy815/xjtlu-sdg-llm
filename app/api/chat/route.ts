import { NextResponse } from "next/server";
import { AnythingLLMError, askAnythingLLM, workspaceMap } from "@/lib/anythingllm";
import { getSkill } from "@/lib/skills/registry";

export async function POST(request: Request) {
  try {
    const { message, account, sessionId, skillId, agentMode } = await request.json();
    const slug = workspaceMap()[account];
    if (!message?.trim()) return NextResponse.json({ error: "请输入问题。" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "该公众号尚未配置 Workspace。" }, { status: 400 });

    const skill = getSkill(skillId);
    const baseTask = skill?.prompt
      ? `[技能：${skill.name}]\n${skill.prompt}\n\n[用户问题]\n${message}`
      : message;
    const task = agentMode ? `@agent ${baseTask}` : baseTask;

    return NextResponse.json(await askAnythingLLM(slug, task, "query", sessionId));
  } catch (error) {
    const status = error instanceof AnythingLLMError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "请求失败。" },
      { status },
    );
  }
}
