import { NextResponse } from "next/server";
import { AnythingLLMError, askAnythingLLMThread, listAnythingLLMWorkspaces, workspaceMap } from "@/lib/anythingllm";

export async function POST(request: Request) {
  try {
    const { workspaceSlug, threadSlug, message } = await request.json();
    const workspace = typeof workspaceSlug === "string" ? workspaceSlug.trim() : "";
    const thread = typeof threadSlug === "string" ? threadSlug.trim() : "";
    const text = typeof message === "string" ? message.trim() : "";
    if (!workspace || !thread || !text) {
      return NextResponse.json({ error: "缺少 Workspace、Thread 或消息内容。" }, { status: 400 });
    }

    const configuredSlugs = new Set(Object.values(workspaceMap()));
    if (!configuredSlugs.has(workspace)) {
      return NextResponse.json({ error: "该 Workspace 不在 Demo 正式配置中。" }, { status: 403 });
    }

    const live = await listAnythingLLMWorkspaces();
    const target = live.find((item) => item.slug === workspace);
    if (!target) return NextResponse.json({ error: "当前 AnythingLLM 中不存在该 Workspace。" }, { status: 404 });
    if (!target.threads?.some((item) => item.slug === thread)) {
      return NextResponse.json({ error: "当前 AnythingLLM 中不存在该 Thread。" }, { status: 404 });
    }

    const result = await askAnythingLLMThread(workspace, thread, text, "query");
    return NextResponse.json(result);
  } catch (error) {
    const status = error instanceof AnythingLLMError ? error.status : 500;
    return NextResponse.json({ error: error instanceof Error ? error.message : "Thread 续聊失败。" }, { status });
  }
}
