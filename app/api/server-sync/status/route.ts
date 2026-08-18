import { NextResponse } from "next/server";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";

export const runtime = "nodejs";

const execFileAsync = promisify(execFile);

export async function GET() {
  const root = process.env.XJTLU_CONTENT_ROOT?.trim();
  if (!root) {
    return NextResponse.json({
      connected: false,
      configured: false,
      message: "尚未配置 XJTLU_CONTENT_ROOT。部署到服务器后建议设置为 /mnt/sdd/xjtlu-content。",
    });
  }

  const python = process.env.PYTHON_BIN?.trim() || (process.platform === "win32" ? "python" : "python3");
  const phase1Script = path.join(process.cwd(), "scripts", "sync-server-articles.py");
  const phase2Script = path.join(process.cwd(), "scripts", "sync-anythingllm.py");
  const envFile = process.env.XJTLU_ENV_FILE?.trim() || path.join(process.cwd(), ".env.local");

  try {
    const { stdout } = await execFileAsync(python, [phase1Script, "status", "--root", root], {
      timeout: 8000,
      maxBuffer: 2 * 1024 * 1024,
      windowsHide: true,
    });
    const parsed = JSON.parse(stdout);

    let phase2: Record<string, unknown> | null = null;
    let phase2Warning = "";
    try {
      const result = await execFileAsync(python, [phase2Script, "status", "--root", root, "--env", envFile], {
        timeout: 12000,
        maxBuffer: 2 * 1024 * 1024,
        windowsHide: true,
      });
      phase2 = JSON.parse(result.stdout);
    } catch (error) {
      phase2Warning = error instanceof Error ? error.message : "无法读取 Phase 2 状态。";
    }

    return NextResponse.json({ connected: true, configured: true, ...parsed, phase2, phase2Warning });
  } catch (error) {
    return NextResponse.json({
      connected: false,
      configured: true,
      root,
      message: error instanceof Error ? error.message : "无法读取服务器文章状态。",
    });
  }
}
