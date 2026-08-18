import { NextResponse } from "next/server";
import { askAnythingLLM, resolveWorkspaceSlug } from "@/lib/anythingllm";

function cleanMarkdown(text: string) {
  const fenced = text.match(/```(?:markdown|md)?\s*([\s\S]*?)```/i)?.[1];
  const value = (fenced || text).trim();
  if (!value.startsWith("#")) throw new Error("模型没有返回可用于思维导图的 Markdown 层级结构。");
  return value.slice(0, 18000);
}

function titleFromMarkdown(markdown: string, fallback: string) {
  const heading = markdown.split(/\r?\n/).find((line) => /^#\s+/.test(line));
  return heading?.replace(/^#\s+/, "").trim().slice(0, 100) || fallback.slice(0, 100);
}

export async function POST(request: Request) {
  try {
    const { message, account, workspaceSlug, sessionId } = await request.json();
    const topic = typeof message === "string" ? message.trim() : "";
    const slug = resolveWorkspaceSlug(account, workspaceSlug);
    if (!topic) return NextResponse.json({ error: "请输入思维导图主题。" }, { status: 400 });
    if (!slug) return NextResponse.json({ error: "当前知识库没有可用的 AnythingLLM Workspace。" }, { status: 400 });

    const prompt = `
[思维导图主题]
${topic}

请仅基于当前 Workspace 检索到的真实文档，为 Markmap 生成一份层次丰富、适合交互展开/折叠的 Markdown 思维导图。

这是“知识组织”任务，不是普通摘要。必须遵守：
1. 只输出 Markdown 层级，不输出 JSON，不要代码围栏，不要额外解释。
2. 第一行必须是一级标题：# <中心主题>。
3. 根据证据组织 4-8 个真正有意义的一级分支（##）。不要机械固定为“核心信息/时间/地点”等；应根据主题选择，例如活动类别、服务类型、部门、流程、资源、对象、时间线、注意事项、行动步骤等。
4. 每个有足够证据的一级分支应继续展开 2-5 个三级节点（###）；必要时可有少量四级节点（####）。目标总节点约 16-40 个，但证据不足时宁可更少。
5. 节点标题要短、具体、可读，尽量不超过 22 个中文字符；不要把整段正文塞进节点。
6. 日期、数字、人名、部门、地点、URL 等必须保留原文事实；不明确的信息不要补写。
7. 相同信息不要在多个分支重复。
8. 如果主题涉及活动或时效信息，在对应节点直接写明日期/截止时间；已过期内容不得包装成“近期可参加”。
9. 每个关键叶子节点末尾可附来源标记，例如“〔来源1〕”。来源序号对应 AnythingLLM 本次引用顺序；无法可靠对应时不要乱标。
10. 不要添加知识库之外的常识或建议。

格式示例（仅示意层级，不要照抄内容）：
# 中心主题
## 分支A
### 具体事项A1
#### 关键日期 / 条件
### 具体事项A2
## 分支B
### 具体事项B1
`;

    const result = await askAnythingLLM(slug, prompt, "query", sessionId);
    const citations = result.citations.slice(0, 12);
    const markdown = cleanMarkdown(result.text);
    return NextResponse.json({
      mindMap: {
        title: titleFromMarkdown(markdown, topic),
        markdown,
        summary: `基于当前 Workspace 的 ${citations.length} 个检索来源生成；可在 Markmap 中缩放、拖动并点击节点展开/折叠。`,
      },
      citations,
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "思维导图生成失败。" }, { status: 500 });
  }
}
