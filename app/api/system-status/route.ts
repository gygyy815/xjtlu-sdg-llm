import { NextResponse } from "next/server";
import { listAnythingLLMWorkspaces } from "@/lib/anythingllm";

export async function GET() {
  let anythingllm = { configured: Boolean(process.env.ANYTHINGLLM_BASE_URL && process.env.ANYTHINGLLM_API_KEY), connected: false, workspaceCount: 0, message: "" };
  if (anythingllm.configured) {
    try {
      const workspaces = await listAnythingLLMWorkspaces();
      anythingllm = { ...anythingllm, connected: true, workspaceCount: workspaces.length, message: "AnythingLLM API 可访问。" };
    } catch (error) {
      anythingllm = { ...anythingllm, message: error instanceof Error ? error.message : "AnythingLLM API 暂时不可访问。" };
    }
  } else {
    anythingllm.message = "缺少 ANYTHINGLLM_BASE_URL 或 ANYTHINGLLM_API_KEY。";
  }

  const supabaseFeedback = Boolean(process.env.SUPABASE_URL && process.env.SUPABASE_SERVICE_ROLE_KEY);
  const serverRepository = Boolean(process.env.XJTLU_CONTENT_ROOT);

  return NextResponse.json({
    anythingllm,
    supabaseFeedback: {
      configured: supabaseFeedback,
      table: process.env.SUPABASE_FEEDBACK_TABLE || "demo_research_feedback",
      message: supabaseFeedback ? "反馈/Section E 可写入 Supabase。" : "未配置时反馈会保存在当前浏览器 localStorage。",
    },
    userHistory: {
      mode: "browser-session",
      configured: true,
      message: "当前使用浏览器 sessionId 隔离。跨设备账号级历史需要后续接入 Supabase Auth 或学校统一身份认证。",
    },
    serverRepository: {
      configured: serverRepository,
      message: serverRepository ? "已配置服务器文章仓库路径。" : "文章同步已暂停时可以不配置 XJTLU_CONTENT_ROOT。",
    },
    optionalTools: {
      mindMap: "ready",
      pptx: "ready",
      extraPackagesRequired: false,
      message: "思维导图复用 Cytoscape.js；PPTX 复用现有 JSZip，不需要新增 API Key。",
    },
  });
}
