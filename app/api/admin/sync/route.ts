import { NextRequest, NextResponse } from "next/server";
import { executeSync, previewSync } from "@/lib/sync-service";

function authorize(request: NextRequest) {
  const configuredToken = process.env.ADMIN_SYNC_TOKEN;
  if (!configuredToken) {
    return NextResponse.json({ error: "服务器尚未配置 ADMIN_SYNC_TOKEN，知识库同步已禁用" }, { status: 503 });
  }
  if (request.headers.get("x-admin-token") !== configuredToken) {
    return NextResponse.json({ error: "管理令牌不正确" }, { status: 401 });
  }
  return null;
}

export async function GET(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;
  try {
    return NextResponse.json(previewSync());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}

export async function POST(request: NextRequest) {
  const denied = authorize(request);
  if (denied) return denied;
  try {
    return NextResponse.json(await executeSync());
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : String(error) }, { status: 400 });
  }
}
