"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { Transformer } from "markmap-lib";
import { Markmap } from "markmap-view";
import { createClientId } from "@/lib/client-id";

type WorkspaceOption = { label: string; slug: string };
type Citation = { title: string; text?: string; url?: string; source?: string; publishedDate?: string };
type MindMap = { title: string; summary: string; markdown: string };

const transformer = new Transformer();

export default function MindMapPage() {
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
    }).catch(() => setError("无法读取当前 AnythingLLM Workspace。"));
  }, []);

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
    setBusy(true); setError(""); setMap(null); setCitations([]);
    try {
      const response = await fetch("/api/skills/mind-map", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ message: topic.trim(), workspaceSlug, account: selectedWorkspace?.label || "", sessionId }),
      });
      const data = await response.json();
      if (!response.ok) throw new Error(data.error || "思维导图生成失败。");
      setMap(data.mindMap);
      setCitations(Array.isArray(data.citations) ? data.citations : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "思维导图生成失败。");
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

  return <main className="toolPage">
    <header className="toolTop"><Link href="/">← 返回助手</Link><span>MIND MAP · MARKMAP</span></header>
    <section className="toolHero"><span>思维导图</span><h1>用 Markmap 展示可展开的校园知识结构</h1><p>AnythingLLM 负责从真实知识库提取和组织信息；开源 Markmap 负责专业的思维导图布局、缩放、拖动与节点折叠。这样语义抽取和可视化各自做最擅长的部分。</p></section>

    <section className="toolComposer">
      <select value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)}>{workspaces.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select>
      <textarea value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：近期校园活动、职业发展服务、图书馆资源使用流程…" />
      <button disabled={!topic.trim() || !workspaceSlug || busy} onClick={generate}>{busy ? "正在生成…" : "生成思维导图"}</button>
    </section>

    {error && <div className="toolError">{error}</div>}
    {map && <section className="mindCard">
      <div className="mindHead"><div><span>INTERACTIVE MARKMAP</span><h2 data-no-ui-translate>{map.title}</h2><p data-no-ui-translate>{map.summary}</p></div><div className="mindActions">
        <button onClick={() => markmapRef.current?.fit()}>适应视图</button>
        <button onClick={() => markmapRef.current?.rescale(1.18)}>放大</button>
        <button onClick={() => markmapRef.current?.rescale(0.85)}>缩小</button>
        <label>展开层级<select value={expandLevel} onChange={(e) => setExpandLevel(Number(e.target.value))}><option value={2}>2</option><option value={3}>3</option><option value={4}>4</option><option value={10}>全部</option></select></label>
        <button onClick={toggleFullscreen}>全屏</button>
        <button onClick={exportSvg}>导出 SVG</button>
        <button onClick={exportMarkdown}>导出 Markdown</button>
      </div></div>
      <div className={`sourceStrip ${citations.length ? "hasSources" : "noSources"}`}>
        <strong>{citations.length ? `来源证据 ${citations.length}` : "来源证据未返回"}</strong>
        {citations.length ? citations.slice(0, 5).map((item, index) => <span key={`${item.title}-${index}`} data-no-ui-translate>S{index + 1} · {item.title}</span>) : <span>本次 AnythingLLM / 向量检索没有返回可展示的来源元数据。</span>}
      </div>
      <div ref={stageRef} className="markmapStage" data-no-ui-translate><svg ref={svgRef} className="markmapSvg" /></div>
      <div className="mindHelp"><strong>交互提示</strong><span>滚轮缩放</span><span>拖动画布</span><span>点击节点圆点展开/折叠</span><span>导图中的 S1/S2 与下方来源列表一一对应</span><span>SVG 可直接用于报告或继续编辑</span></div>
    </section>}

    {map && <section className="sourcePanel"><h2>参考来源</h2>{citations.length ? citations.map((item, index) => <article key={index}><strong data-no-ui-translate>S{index + 1}. {item.title}</strong>{item.source && <span data-no-ui-translate>{item.source}</span>}{item.publishedDate && <span data-no-ui-translate>{item.publishedDate}</span>}{item.text && <p data-no-ui-translate>{item.text.slice(0, 260)}</p>}{item.url && <a href={item.url} target="_blank" rel="noreferrer">查看原文 ↗</a>}</article>) : <div className="sourceEmpty">本次检索没有返回可展示来源。建议确认 Workspace 文档是否包含来源元数据，或稍后重试。</div>}</section>}

    <style jsx>{`
      .toolPage{min-height:100vh;background:#f6f7fa;color:#19232d;padding:0 28px 80px}.toolTop{height:70px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e1e6eb}.toolTop a,.sourcePanel a{color:#5862d9;text-decoration:none;font-weight:700}.toolTop span,.toolHero>span,.mindHead span{font-size:11px;letter-spacing:.13em;color:#6570dc;font-weight:800}.toolHero,.toolComposer,.mindCard,.sourcePanel,.toolError{max-width:1240px;margin-left:auto;margin-right:auto}.toolHero{margin-top:46px}.toolHero h1{font-size:34px;margin:8px 0}.toolHero p{color:#6f7b85;line-height:1.7}.toolComposer{display:grid;grid-template-columns:220px minmax(0,1fr) auto;gap:10px;background:#fff;border:1px solid #e0e5eb;border-radius:16px;padding:14px;margin-top:20px}.toolComposer select,.toolComposer textarea{border:1px solid #d9dfe7;border-radius:10px;padding:10px 12px;font:inherit;background:#fff}.toolComposer textarea{min-height:76px;resize:vertical}.toolComposer button,.mindActions button{border:0;border-radius:10px;background:#5b61e9;color:#fff;padding:10px 14px;font-weight:700;cursor:pointer}.toolComposer button:disabled{opacity:.45}.toolError{margin-top:16px;background:#fff0ef;color:#9b4d49;padding:14px 16px;border-radius:12px}.mindCard,.sourcePanel{margin-top:18px;background:#fff;border:1px solid #e1e6ec;border-radius:18px;overflow:hidden}.mindHead{padding:20px 22px;display:flex;justify-content:space-between;gap:18px;border-bottom:1px solid #e9edf1}.mindHead h2{margin:5px 0}.mindHead p{margin:0;color:#6d7882;max-width:650px}.mindActions{display:flex;gap:7px;align-items:flex-start;justify-content:flex-end;flex-wrap:wrap}.mindActions button{background:#f1f2ff;color:#4f59d0;border:1px solid #dfe2fa;padding:8px 10px}.mindActions label{display:flex;align-items:center;gap:6px;background:#f7f8fb;border:1px solid #e1e5ec;border-radius:10px;padding:4px 7px;font-size:11px;color:#67727c}.mindActions select{border:0;background:transparent;color:#4f59d0;font-weight:700;outline:0}.sourceStrip{display:flex;align-items:center;gap:8px;flex-wrap:wrap;padding:10px 18px;border-bottom:1px solid #edf0f4;background:#fafbff;font-size:11px}.sourceStrip strong{color:#505bc7}.sourceStrip span{max-width:280px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;padding:5px 8px;border:1px solid #e1e5f7;border-radius:999px;background:#fff;color:#67727c}.sourceStrip.noSources{background:#fff8eb}.sourceStrip.noSources strong{color:#a96a2a}.markmapStage{height:650px;background:#fbfcfd;overflow:hidden}.markmapStage:fullscreen{height:100vh;background:#fff}.markmapSvg{width:100%;height:100%;display:block}.mindHelp{display:flex;gap:10px;flex-wrap:wrap;padding:11px 18px;border-top:1px solid #edf0f4;background:#fafbfc;font-size:11px;color:#7a8590}.mindHelp strong{color:#3c4650}.mindHelp span{padding-left:10px;border-left:1px solid #dfe4ea}.sourcePanel{padding:22px}.sourcePanel h2{margin-top:0}.sourcePanel article{padding:12px 0;border-top:1px solid #edf0f3}.sourcePanel article:first-of-type{border-top:0}.sourcePanel article span{display:block;color:#7a8690;font-size:12px;margin-top:3px}.sourcePanel article p{margin:8px 0 0;color:#66727d;font-size:12px;line-height:1.6}.sourcePanel article a{display:inline-block;margin-top:6px;font-size:12px}.sourceEmpty{padding:18px;border-radius:12px;background:#fff8eb;color:#8b632f;font-size:12px}@media(max-width:900px){.toolComposer{grid-template-columns:1fr}.mindHead{display:block}.mindActions{margin-top:14px;justify-content:flex-start}.markmapStage{height:560px}}@media(max-width:520px){.toolPage{padding-inline:14px}.markmapStage{height:500px}}
    `}</style>
  </main>;
}
