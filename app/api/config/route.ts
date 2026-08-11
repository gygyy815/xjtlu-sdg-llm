import { NextResponse } from "next/server";
import { workspaceMap } from "@/lib/anythingllm";

export async function GET() {
  return NextResponse.json({ accounts: Object.keys(workspaceMap()) });
}
