"use client";

import { useEffect, useRef, useState } from "react";

type Lang = "zh" | "en";
const STORAGE_KEY = "xjtlu-ui-language";

const dictionary: Record<string, string> = {
  "新建对话": "New chat",
  "对话历史": "Chat history",
  "浏览知识": "Browse knowledge",
  "知识库管理": "Knowledge bases",
  "数据看板": "Dashboard",
  "反馈与建议": "Feedback",
  "设置": "Settings",
  "知识库": "Knowledge base",
  "知识库状态：": "Knowledge base status: ",
  "已连接": "Connected",
  "未配置": "Not configured",
  "浏览文章 →": "Browse articles →",
  "可核查校园知识助手": "Verifiable campus knowledge assistant",
  "检索文章、提取活动信息、生成关系图并填写文件": "Search articles, extract events, build relationship maps and fill files",
  "所有知识类回答基于当前 AnythingLLM 中实际存在的 Workspace；缺少明确证据时不推测。": "Knowledge answers are grounded in the active AnythingLLM workspace; unsupported details are not guessed.",
  "查找近期活动": "Find upcoming events",
  "提取活动信息": "Extract event details",
  "检查信息有效性": "Check validity",
  "生成文章摘要": "Summarize article",
  "选择右侧技能，然后输入你的问题。": "Choose a skill on the right, then enter your question.",
  "知识图谱会抽取活动、部门、受众、地点与时间；文件填写会先识别字段再让你确认。": "Knowledge Graph extracts events, departments, audiences, places and time; File Fill detects fields before asking you to confirm.",
  "文件": "File",
  "Agent 模式": "Agent mode",
  "发送": "Send",
  "本次会话概览": "Session overview",
  "对话请求": "Chat requests",
  "文件处理": "Files processed",
  "技能中心": "Skill Center",
  "清除": "Clear",
  "搜索技能": "Search skills",
  "创建新技能": "Create skill",
  "导入技能": "Import skill",
  "官方技能": "Built-in",
  "我的技能": "My skills",
  "已导入": "Imported",
  "内置": "Built-in",
  "导入": "Imported",
  "自建": "Custom",
  "收起": "Collapse",
  "技能": "Skills",
  "知识图谱": "Knowledge Graph",
  "文件填写": "File Fill",
  "文章摘要": "Article Summary",
  "活动信息提取": "Event Extraction",
  "信息有效性检查": "Validity Check",
  "中英双语": "Bilingual Output",
  "知识图解": "Knowledge Explainer",
  "PPT 制作": "PPT Builder",
  "学习模式": "Learning Mode",
  "思维导图": "Mind Map",
  "返回助手": "Back to assistant",
  "生成思维导图": "Generate mind map",
  "正在生成…": "Generating…",
  "适应视图": "Fit view",
  "放大": "Zoom in",
  "缩小": "Zoom out",
  "展开层级": "Expand level",
  "全部": "All",
  "全屏": "Fullscreen",
  "导出 SVG": "Export SVG",
  "导出 Markdown": "Export Markdown",
  "交互提示": "Interaction",
  "滚轮缩放": "Mouse-wheel zoom",
  "拖动画布": "Drag to pan",
  "点击节点圆点展开/折叠": "Click node circles to expand/collapse",
  "参考来源": "Sources",
  "查看原文 ↗": "Open source ↗",
  "基于知识库证据生成可下载的演示文稿": "Generate downloadable presentations from knowledge-base evidence",
  "内容页数量": "Content slides",
  "语言": "Language",
  "中文": "Chinese",
  "汇报主题 / 要求": "Presentation topic / requirements",
  "生成 PPTX": "Generate PPTX",
  "正在检索并生成 PPT…": "Retrieving evidence and building PPT…",
  "下载 PPTX": "Download PPTX",
  "我的对话历史": "My chat history",
  "我的历史会话": "My conversations",
  "历史消息": "History messages",
  "本机 Session": "Browser sessions",
  "来源引用": "Source citations",
  "全部知识库": "All knowledge bases",
  "刷新": "Refresh",
  "当前用户还没有可显示的历史会话。": "No history is available for this browser user yet.",
  "界面与交互偏好": "Interface & interaction preferences",
  "默认收起技能中心": "Collapse Skill Center by default",
  "紧凑界面": "Compact interface",
  "记住上次技能": "Remember last skill",
  "优先展示证据": "Show evidence first"
};

const originalText = new WeakMap<Text, string>();
const originalAttrs = new WeakMap<Element, Record<string, string>>();

function shouldSkip(node: Text) {
  const parent = node.parentElement;
  return Boolean(parent?.closest(".messageBody,.citations,.sourcePanel,.fileCard,.historyMessage p,.attachmentChip,pre,code,[data-no-ui-translate]"));
}

function translateDynamic(value: string) {
  const official = value.match(/^官方技能\s*\((\d+)\)$/);
  if (official) return `Built-in (${official[1]})`;
  const mine = value.match(/^我的技能\s*\((\d+)\)$/);
  if (mine) return `My skills (${mine[1]})`;
  const imported = value.match(/^已导入\s*\((\d+)\)$/);
  if (imported) return `Imported (${imported[1]})`;
  return dictionary[value] || value;
}

function applyLanguage(lang: Lang) {
  document.documentElement.lang = lang === "en" ? "en" : "zh-CN";
  document.documentElement.dataset.uiLanguage = lang;
  const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  let node = walker.nextNode() as Text | null;
  while (node) {
    if (!shouldSkip(node)) {
      if (!originalText.has(node)) originalText.set(node, node.nodeValue || "");
      const original = originalText.get(node) || "";
      const trimmed = original.trim();
      if (trimmed) {
        const translated = lang === "en" ? translateDynamic(trimmed) : trimmed;
        const leading = original.match(/^\s*/)?.[0] || "";
        const trailing = original.match(/\s*$/)?.[0] || "";
        const desired = `${leading}${translated}${trailing}`;
        if (node.nodeValue !== desired) node.nodeValue = desired;
      }
    }
    node = walker.nextNode() as Text | null;
  }

  document.querySelectorAll("input[placeholder],textarea[placeholder],[title],[aria-label]").forEach((element) => {
    if (element.closest(".messageBody,.citations,.sourcePanel")) return;
    const current: Record<string, string> = originalAttrs.get(element) || {};
    ["placeholder", "title", "aria-label"].forEach((attr) => {
      const value = element.getAttribute(attr);
      if (value && !current[attr]) current[attr] = value;
      const original = current[attr];
      if (original) {
        const desired = lang === "en" ? translateDynamic(original) : original;
        if (element.getAttribute(attr) !== desired) element.setAttribute(attr, desired);
      }
    });
    originalAttrs.set(element, current);
  });
}

export function UiLanguageToggle() {
  const [lang, setLang] = useState<Lang>("zh");
  const langRef = useRef<Lang>("zh");

  useEffect(() => {
    const stored = localStorage.getItem(STORAGE_KEY) === "en" ? "en" : "zh";
    langRef.current = stored;
    setLang(stored);
    applyLanguage(stored);
    const observer = new MutationObserver(() => window.requestAnimationFrame(() => applyLanguage(langRef.current)));
    observer.observe(document.body, { childList: true, subtree: true });
    return () => observer.disconnect();
  }, []);

  function switchTo(next: Lang) {
    langRef.current = next;
    setLang(next);
    localStorage.setItem(STORAGE_KEY, next);
    applyLanguage(next);
  }

  return <div className="uiLanguageToggle" data-no-ui-translate>
    <button className={lang === "zh" ? "active" : ""} onClick={() => switchTo("zh")}>中文</button>
    <span>/</span>
    <button className={lang === "en" ? "active" : ""} onClick={() => switchTo("en")}>EN</button>
    <style jsx>{`
      .uiLanguageToggle{position:fixed;right:22px;bottom:22px;z-index:120;display:flex;align-items:center;gap:5px;padding:7px 9px;background:#fff;border:1px solid #dfe4ea;border-radius:999px;box-shadow:0 10px 30px #24334d22;font-size:11px;color:#8a949e}.uiLanguageToggle button{border:0;background:transparent;padding:4px 6px;border-radius:999px;color:#7b8690;font:inherit;font-weight:800;cursor:pointer}.uiLanguageToggle button.active{background:#5f63e8;color:#fff}.uiLanguageToggle span{color:#c3c8cf}@media(max-width:620px){.uiLanguageToggle{right:12px;bottom:12px}}
    `}</style>
  </div>;
}
