import { NextResponse } from "next/server";
import { askAnythingLLM, workspaceMap } from "@/lib/anythingllm";

export async function POST(request: Request) {
  try {
    const { message, account, agentMode } = await request.json();
    const slug = workspaceMap()[account];
    if (!message?.trim()) return NextResponse.json({ error: "请输入问题。" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "该公众号尚未配置 Workspace。" }, { status: 400 });
    return NextResponse.json(await askAnythingLLM(slug, agentMode ? `@agent ${message}` : message, agentMode ? "chat" : "query"));
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "请求失败。" }, { status: 500 });
  }
}
