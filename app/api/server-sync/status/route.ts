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
  const script = path.join(process.cwd(), "scripts", "sync-server-articles.py");

  try {
    const { stdout } = await execFileAsync(python, [script, "status", "--root", root], {
      timeout: 8000,
      maxBuffer: 1024 * 1024,
      windowsHide: true,
    });
    const parsed = JSON.parse(stdout);
    return NextResponse.json({ connected: true, configured: true, ...parsed });
  } catch (error) {
    return NextResponse.json({
      connected: false,
      configured: true,
      root,
      message: error instanceof Error ? error.message : "无法读取服务器文章状态。",
    });
  }
}
