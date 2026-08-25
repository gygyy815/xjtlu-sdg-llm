"use client";

import { useEffect, useRef, useState } from "react";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";
import { createClientId } from "@/lib/client-id";
import { useProductLanguage } from "@/lib/product-language";

type WorkspaceOption = { label: string; slug: string };
type Citation = { title: string; text?: string; url?: string; source?: string; publishedDate?: string };
type MindMap = { title: string; summary: string; markdown: string };

const transformer = new Transformer();

export default function MindMapPage() {
  const { lang, t } = useProductLanguage();
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [topic, setTopic] = useState("");
  const [map, setMap] = useState<MindMap | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [expandLevel, setExpandLevel] = useState(4);
  const [sessionId] = useState(() => createClientId());
  const svgRef = useRef<SVGSVGElement>(null);
  const stageRef = useRef<HTMLDivElement>(null);
  const markmapRef = useRef<Markmap | null>(null);

  const selectedWorkspace = workspaces.find((item) => item.slug === workspaceSlug);

  useEffect(() => {
    fetch("/api/config").then((response) => response.json()).then((data) => {
      const options = Array.isArray(data.workspaces) ? data.workspaces.filter((item: WorkspaceOption) => item?.slug && item?.label) : [];
      setWorkspaces(options);
      setWorkspaceSlug(options[0]?.slug || "");
    }).catch(() => setError(t("无法读取当前 AnythingLLM Workspace。", "Unable to load the current AnythingLLM Workspace.")));
  }, [lang]);

  useEffect(() => {
    if (!map?.markdown || !svgRef.current) return;
    markmapRef.current?.destroy();
    const { root } = transformer.transform(map.markdown);
    const mm = Markmap.create(svgRef.current, {
      autoFit: true,
      duration: 350,
      fitRatio: 0.92,
      initialExpandLevel: expandLevel,
      maxInitialScale: 1.25,
      maxWidth: 260,
      nodeMinHeight: 22,
      paddingX: 12,
      pan: true,
      scrollForPan: false,
      spacingHorizontal: 90,
      spacingVertical: 10,
      toggleRecursively: false,
      zoom: true,
    }, root);
    markmapRef.current = mm;
    window.setTimeout(() => mm.fit(), 80);
    return () => mm.destroy();
  }, [map, expandLevel]);

  async function generate() {
    if (!topic.trim() || !workspaceSlug || busy) return;
    setBusy(true);
    setError("");
    setMap(null);
    setCitations([]);
    try {
      const response = await fetch("/api/skills/mind-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: topic.trim(), workspaceSlug, account: selectedWorkspace?.label || "", sessionId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || t("思维导图生成失败。", "Mind map generation failed."));
      setMap(data.mindMap);
      setCitations(Array.isArray(data.citations) ? data.citations : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : t("思维导图生成失败。", "Mind map generation failed."));
    } finally {
      setBusy(false);
    }
  }

  async function toggleFullscreen() {
    if (!stageRef.current) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await stageRef.current.requestFullscreen();
    window.setTimeout(() => markmapRef.current?.fit(), 150);
  }

  function exportSvg() {
    const svg = svgRef.current;
    if (!svg || !map) return;
    const clone = svg.cloneNode(true) as SVGSVGElement;
    clone.setAttribute("xmlns", "http://www.w3.org/2000/svg");
    clone.setAttribute("width", String(svg.clientWidth || 1400));
    clone.setAttribute("height", String(svg.clientHeight || 800));
    const blob = new Blob([new XMLSerializer().serializeToString(clone)], { type: "image/svg+xml;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${map.title.replace(/[\\/:*?"<>|]/g, "-")}.svg`;
    a.click();
    URL.revokeObjectURL(url);
  }

  function exportMarkdown() {
    if (!map) return;
    const blob = new Blob([map.markdown], { type: "text/markdown;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${map.title.replace(/[\\/:*?"<>|]/g, "-")}.md`;
    a.click();
    URL.revokeObjectURL(url);
  }

  return <main className="toolPage cleanPage">
    <section className="toolHero cleanPageHeader">
      <span>MIND MAP</span>
      <h1>{t("把校园知识整理成可展开的思维导图", "Turn campus knowledge into an interactive mind map")}</h1>
      <p>{t("AnythingLLM 负责检索真实知识库，Markmap 负责交互式布局、缩放与节点折叠。", "AnythingLLM retrieves grounded knowledge, while Markmap handles the interactive layout, zooming and node folding.")}</p>
    </section>

    <section className="toolComposer cleanCard">
      <label><span>{t("知识库", "Knowledge base")}</span><select value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)}>{workspaces.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select></label>
      <label className="toolTopic"><span>{t("主题", "Topic")}</span><textarea value={topic} onChange={(event) => setTopic(event.target.value)} placeholder={t("例如：近期校园活动、职业发展服务、图书馆资源使用流程…", "For example: upcoming campus events, career services, library resource workflows…")} /></label>
      <button disabled={!topic.trim() || !workspaceSlug || busy} onClick={generate}>{busy ? t("正在生成…", "Generating…") : t("生成思维导图", "Generate mind map")}</button>
    </section>

    {error && <div className="toolError">{error}</div>}

    {map && <section className="mindCard cleanCard">
      <div className="mindHead"><div><span>INTERACTIVE MARKMAP</span><h2 data-no-ui-translate>{map.title}</h2><p data-no-ui-translate>{map.summary}</p></div><div className="mindActions">
        <button onClick={() => markmapRef.current?.fit()}>{t("适应视图", "Fit view")}</button>
        <button onClick={() => markmapRef.current?.rescale(1.18)}>{t("放大", "Zoom in")}</button>
        <button onClick={() => markmapRef.current?.rescale(0.85)}>{t("缩小", "Zoom out")}</button>
        <label>{t("展开层级", "Expand level")}<select value={expandLevel} onChange={(event) => setExpandLevel(Number(event.target.value))}><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option><option value={10}>{t("全部", "All")}</option></select></label>
        <button onClick={toggleFullscreen}>{t("全屏", "Fullscreen")}</button>
        <button onClick={exportSvg}>{t("导出 SVG", "Export SVG")}</button>
        <button onClick={exportMarkdown}>{t("导出 Markdown", "Export Markdown")}</button>
      </div></div>

      <div className={`sourceStrip ${citations.length ? "hasSources" : "noSources"}`}>
        <strong>{citations.length ? t(`来源证据 ${citations.length}`, `${citations.length} sources`) : t("来源证据未返回", "No source evidence returned")}</strong>
        {citations.length ? citations.slice(0, 5).map((item, index) => <span key={`${item.title}-${index}`} data-no-ui-translate>S{index + 1} · {item.title}</span>) : <span>{t("本次检索没有返回可展示的来源元数据。", "This retrieval did not return displayable source metadata.")}</span>}
      </div>
      <div ref={stageRef} className="markmapStage" data-no-ui-translate><svg ref={svgRef} className="markmapSvg" /></div>
      <div className="mindHelp"><strong>{t("交互提示", "Interaction")}</strong><span>{t("滚轮缩放", "Mouse-wheel zoom")}</span><span>{t("拖动画布", "Drag to pan")}</span><span>{t("点击节点圆点展开/折叠", "Click node circles to expand/collapse")}</span><span>{t("SVG 可继续编辑", "SVG can be edited further")}</span></div>
    </section>}

    {map && <section className="sourcePanel cleanCard"><h2>{t("参考来源", "Sources")}</h2>{citations.length ? citations.map((item, index) => <article key={index}><strong data-no-ui-translate>S{index + 1}. {item.title}</strong>{item.source && <span data-no-ui-translate>{item.source}</span>}{item.publishedDate && <span data-no-ui-translate>{item.publishedDate}</span>}{item.text && <p data-no-ui-translate>{item.text.slice(0, 260)}</p>}{item.url && <a href={item.url} target="_blank" rel="noreferrer">{t("查看原文 ↗", "Open source ↗")}</a>}</article>) : <div className="sourceEmpty">{t("本次检索没有返回可展示来源。请确认 Workspace 文档是否包含来源元数据。", "This retrieval did not return displayable sources. Check whether the Workspace documents contain source metadata.")}</div>}</section>}

    <style jsx>{`
      .toolComposer{display:grid;grid-template-columns:220px minmax(0,1fr) auto;gap:12px;align-items:end}.toolComposer label{display:grid;gap:6px;font-size:13px;font-weight:750}.toolComposer select,.toolComposer textarea{width:100%;padding:10px 11px;border:1px solid var(--ui-line);border-radius:9px;background:#fff}.toolTopic textarea{min-height:76px;resize:vertical}.toolComposer button{min-height:42px;border:0;border-radius:9px;background:var(--ui-green);color:#fff;padding:0 15px;font-weight:750}.toolComposer button:disabled{opacity:.45}.toolError{margin-top:14px;padding:13px 15px;border-radius:10px;background:#fff3f1;color:var(--ui-danger)}.mindCard,.sourcePanel{margin-top:16px;overflow:hidden}.mindHead{display:flex;justify-content:space-between;gap:18px;padding:18px 20px;border-bottom:1px solid var(--ui-line)}.mindHead>div:first-child>span{font-size:12px;color:var(--ui-green-dark);font-weight:850;letter-spacing:.1em}.mindHead h2{margin:5px 0;font-size:22px}.mindHead p{max-width:650px;margin:0;color:var(--ui-muted);font-size:13px}.mindActions{display:flex;gap:7px;align-items:flex-start;justify-content:flex-end;flex-wrap:wrap}.mindActions button{min-height:34px;border:1px solid var(--ui-line);border-radius:8px;background:#f7faf8;color:var(--ui-green-dark);padding:0 9px;font-size:12px;font-weight:700}.mindActions label{display:flex;align-items:center;gap:5px;min-height:34px;padding:0 8px;border:1px solid var(--ui-line);border-radius:8px;font-size:12px}.mindActions select{border:0;background:transparent}.sourceStrip{display:flex;align-items:center;gap:7px;flex-wrap:wrap;padding:10px 16px;border-bottom:1px solid var(--ui-line);background:#fafcfb;font-size:12px}.sourceStrip strong{color:var(--ui-green-dark)}.sourceStrip span{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:5px 8px;border:1px solid var(--ui-line);border-radius:999px;background:#fff}.sourceStrip.noSources{background:#fff8ec}.markmapStage{height:620px;background:#fbfcfb;overflow:hidden}.markmapStage:fullscreen{height:100vh;background:#fff}.markmapSvg{width:100%;height:100%;display:block}.mindHelp{display:flex;gap:10px;flex-wrap:wrap;padding:11px 16px;border-top:1px solid var(--ui-line);background:#fafcfb;font-size:12px;color:var(--ui-muted)}.mindHelp span{padding-left:10px;border-left:1px solid var(--ui-line)}.sourcePanel{padding:20px}.sourcePanel h2{margin-top:0}.sourcePanel article{padding:12px 0;border-top:1px solid var(--ui-line)}.sourcePanel article:first-of-type{border-top:0}.sourcePanel article span{display:block;margin-top:3px;color:var(--ui-muted);font-size:12px}.sourcePanel article p{margin:8px 0;color:#56675f;font-size:13px;line-height:1.6}.sourcePanel article a{display:inline-block;margin-top:5px;color:var(--ui-green-dark);font-size:13px;font-weight:700;text-decoration:none}.sourceEmpty{padding:16px;border-radius:9px;background:#fff8ec;color:#835f34;font-size:13px}@media(max-width:900px){.toolComposer{grid-template-columns:1fr}.mindHead{display:block}.mindActions{justify-content:flex-start;margin-top:12px}.markmapStage{height:540px}}
    `}</style>
  </main>;
}
