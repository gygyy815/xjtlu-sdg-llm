import { NextResponse } from "next/server";
import { AnythingLLMError, askAnythingLLM, workspaceMap } from "@/lib/anythingllm";

export async function POST(request: Request) {
  try {
    const { message, account, agentMode, sessionId, skillPrompt } = await request.json();
    const slug = workspaceMap()[account];
    if (!message?.trim()) return NextResponse.json({ error: "请输入问题。" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "该公众号尚未配置 Workspace。" }, { status: 400 });

    const task = skillPrompt ? `[技能指令]\n${skillPrompt}\n\n[用户问题]\n${message}` : message;
    const prompt = agentMode ? `@agent ${task}` : task;
    const mode = agentMode ? "chat" : "query";
    return NextResponse.json(await askAnythingLLM(slug, prompt, mode, sessionId));
  } catch (error) {
    const status = error instanceof AnythingLLMError ? error.status : 500;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "请求失败。" },
      { status },
    );
  }
}
