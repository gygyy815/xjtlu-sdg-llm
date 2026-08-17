import { NextResponse } from "next/server";
import { askAnythingLLM, workspaceMap } from "@/lib/anythingllm";

function safeJson(text: string) {
  const match = text.match(/\{[\s\S]*\}/);
  if (!match) throw new Error("模型没有返回可解析的知识图谱 JSON。");
  return JSON.parse(match[0]);
}

export async function POST(request: Request) {
  try {
    const { message, account, sessionId } = await request.json();
    const slug = workspaceMap()[account];
    if (!message?.trim()) return NextResponse.json({ error: "请输入要生成图谱的主题。" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "该知识库尚未配置 Workspace。" }, { status: 400 });

    const prompt = `
你正在为 XJTLU 校园知识库生成一个可视化关系图。只允许使用检索文档中明确出现的信息，不得猜测。

用户主题：${message}

请从最相关的文章中抽取以下实体：
- activity：活动/项目/讲座/通知中的具体活动
- department：部门/组织/学院/公众号来源
- audience：参与对象/受众
- location：明确地点
- time：明确日期或时间
- topic：用于连接这些实体的核心主题（最多 2 个，不包含 SDG）

要求：
1. 日期、地点、机构名必须按原文事实；缺失就不要创建节点。
2. 不要创建 SDG 节点，本版本暂不处理 SDG 打标。
3. 节点总数不超过 18；关系不超过 30。
4. 每条关系必须能由检索内容直接支持。
5. 返回 ONLY 一个合法 JSON 对象，不要 Markdown，不要解释。

JSON schema:
{
  "title": "简短图谱标题",
  "summary": "1-2 句说明图谱展示了什么以及证据限制",
  "nodes": [
    {"id":"n1","label":"实体名称","type":"topic|activity|department|audience|location|time"}
  ],
  "edges": [
    {"source":"n1","target":"n2","label":"举办/面向/位于/发生于/负责/相关"}
  ]
}`;

    const result = await askAnythingLLM(slug, prompt, "query", sessionId);
    const graph = safeJson(result.text);
    return NextResponse.json({ graph, citations: result.citations });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "知识图谱生成失败。" }, { status: 500 });
  }
}
