const exact: Record<string, string> = {
  "页（请求": "slides (requested",
  "页） · 本次检索使用": "slides) · retrieved",
  "个来源。": "sources.",
  "本次主题已启用时效性校验。": "Validity checks are enabled for this time-sensitive topic.",
  "本次主题按一般证据规则生成。": "This topic uses the standard evidence rules.",
  "西交利物浦大学": "Xi'an Jiaotong-Liverpool University",
  "西交利物浦大学图书馆": "XJTLU Library",
  "西浦学生服务": "XJTLU Student Services",
  "生成结果": "Generated result",
  "来源证据": "Source evidence",
  "无法读取当前 AnythingLLM Workspace。": "Unable to load the current AnythingLLM Workspace.",
  "暂无记录": "No record",
  "存在。": "Exists.",
  "允许仅进入总库": "may enter the aggregate Workspace only",
  "仍会等待确认": "will still wait for confirmation",
  "未分类": "Unclassified",
  "同步策略": "Sync policy",
  "来源识别": "Source identification",
  "状态暂不可用：": "status is temporarily unavailable: ",
  "保存失败。": "Save failed.",
};

// These phrases occur as separate React text nodes around <code>/<strong> elements.
// Replacing segments lets the page remain readable even when JSX splits a sentence.
const segments: Array<readonly [string, string]> = [
  ["在 AnythingLLM 手动创建 Workspace，再把", "Create a Workspace manually in AnythingLLM, then add"],
  ["加入", "to"],
  ["配置", "Configure"],
  ["并将", "and set"],
  ["只要文章有明确", "As long as an article has an explicit"],
  ["新公众号无需新建 Workspace，也可以进入总库。", "a new official account can enter the aggregate Workspace without creating a new Workspace."],
  ["只决定 Demo 顶部下拉框显示哪些知识库，不必把几十个公众号全部放进去。", "only controls which knowledge bases appear in the Demo selector; you do not need to list every official account there."],
  ["任何真实同步前都先运行", "Before any real sync, run"],
  ["和", "and"],
  ["当前没有可用 Workspace。请检查 AnythingLLM 与", "No Workspace is currently available. Check AnythingLLM and"],
  ["系统优先读取文章里的", "The system first reads"],
  ["；没有该字段时才使用", "; if that field is absent, it uses"],
  ["的文件夹名；两者都没有就标记“未分类”。来源身份写进 SQLite 和 processed 文档，所以物理文件是否混放不影响后续区分。", "as the folder name. If neither is available, the article is marked “Unclassified”. Source identity is stored in SQLite and processed documents, so mixing physical files does not affect later separation."],
  ["存在。未映射来源", "Exists. Unmapped sources"],
  ["。", "."],
  ["Phase 2 状态暂不可用：", "Phase 2 status is temporarily unavailable: "],
  ["同步完成：", "Sync complete: "],
  ["个变更，", "changes, "],
  ["个失败。", "failed."],
  ["个", ""],
];

export function translateUiExtra(value: string) {
  const trimmed = value.trim();
  if (!trimmed) return value;
  if (exact[trimmed]) return exact[trimmed];

  let output = trimmed;
  let changed = false;
  // Prefer longer phrases first so a short token cannot damage a longer match.
  for (const [from, to] of [...segments].sort((a, b) => b[0].length - a[0].length)) {
    if (!output.includes(from)) continue;
    output = output.split(from).join(to);
    changed = true;
  }
  return changed ? output.replace(/\s+/g, " ").replace(/\s+([,.;:])/g, "$1").trim() : trimmed;
}
