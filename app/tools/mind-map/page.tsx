"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { type Core } from "cytoscape";
import { createClientId } from "@/lib/client-id";

type WorkspaceOption = { label: string; slug: string };
type Citation = { title: string; text?: string; url?: string; source?: string; publishedDate?: string };
type MindMap = {
  title: string;
  summary: string;
  rootId: string;
  nodes: { id: string; label: string; detail?: string; level: number; sourceIndex?: number }[];
  edges: { source: string; target: string }[];
};

export default function MindMapPage() {
  const [workspaces, setWorkspaces] = useState<WorkspaceOption[]>([]);
  const [workspaceSlug, setWorkspaceSlug] = useState("");
  const [topic, setTopic] = useState("");
  const [map, setMap] = useState<MindMap | null>(null);
  const [citations, setCitations] = useState<Citation[]>([]);
  const [selectedId, setSelectedId] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [sessionId] = useState(() => createClientId());
  const canvasRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);

  const selectedWorkspace = workspaces.find((item) => item.slug === workspaceSlug);
  const selectedNode = map?.nodes.find((node) => node.id === selectedId) || null;
  const selectedCitation = selectedNode?.sourceIndex ? citations[selectedNode.sourceIndex - 1] : null;

  useEffect(() => {
    fetch("/api/config").then((response) => response.json()).then((data) => {
      const options = Array.isArray(data.workspaces) ? data.workspaces.filter((item: WorkspaceOption) => item?.slug && item?.label) : [];
      setWorkspaces(options);
      setWorkspaceSlug(options[0]?.slug || "");
    }).catch(() => setError("无法读取当前 AnythingLLM Workspace。"));
  }, []);

  useEffect(() => {
    if (!map || !canvasRef.current) return;
    cyRef.current?.destroy();
    const cy = cytoscape({
      container: canvasRef.current,
      elements: [
        ...map.nodes.map((node) => ({ data: { id: node.id, label: node.label, level: node.level } })),
        ...map.edges.map((edge, index) => ({ data: { id: `e${index}`, source: edge.source, target: edge.target } })),
      ],
      style: [
        { selector: "node", style: { "label": "data(label)", "text-wrap": "wrap", "text-max-width": "105px", "font-size": 12, "background-color": "#eef1ff", "border-color": "#7d86ea", "border-width": 1.5, "color": "#27313b", "width": 78, "height": 44, "shape": "round-rectangle", "text-valign": "center", "text-halign": "center" } },
        { selector: 'node[level = 0]', style: { "background-color": "#5f63e8", "border-color": "#4d52cf", "color": "#ffffff", "font-weight": 700, "width": 112, "height": 58, "font-size": 13 } },
        { selector: 'node[level = 1]', style: { "background-color": "#e7f7f1", "border-color": "#65b99a" } },
        { selector: 'node[level = 2]', style: { "background-color": "#fff5e8", "border-color": "#e3a65d" } },
        { selector: 'node[level >= 3]', style: { "background-color": "#f6ecff", "border-color": "#b286df" } },
        { selector: "edge", style: { "width": 1.4, "line-color": "#c2c9d3", "target-arrow-color": "#c2c9d3", "target-arrow-shape": "triangle", "curve-style": "bezier" } },
        { selector: ":selected", style: { "border-width": 3, "border-color": "#3137b9" } },
      ],
      layout: { name: "breadthfirst", directed: true, roots: `#${map.rootId}`, padding: 42, spacingFactor: 1.25 },
      wheelSensitivity: 0.18,
    });
    cy.on("tap", "node", (event) => setSelectedId(event.target.id()));
    cy.fit(undefined, 36);
    cyRef.current = cy;
    return () => cy.destroy();
  }, [map]);

  async function generate() {
    if (!topic.trim() || !workspaceSlug || busy) return;
    setBusy(true); setError(""); setMap(null); setCitations([]); setSelectedId("");
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
      setSelectedId(data.mindMap?.rootId || "");
    } catch (err) {
      setError(err instanceof Error ? err.message : "思维导图生成失败。");
    } finally {
      setBusy(false);
    }
  }

  function exportPng() {
    const dataUrl = cyRef.current?.png({ full: true, scale: 2, bg: "#ffffff" });
    if (!dataUrl) return;
    const a = document.createElement("a");
    a.href = dataUrl;
    a.download = `${(map?.title || "mind-map").replace(/[\\/:*?"<>|]/g, "-")}.png`;
    a.click();
  }

  const levelCounts = useMemo(() => {
    if (!map) return [] as [number, number][];
    const counts = new Map<number, number>();
    map.nodes.forEach((node) => counts.set(node.level, (counts.get(node.level) || 0) + 1));
    return Array.from(counts.entries()).sort((a, b) => a[0] - b[0]);
  }, [map]);

  return <main className="toolPage">
    <header className="toolTop"><Link href="/">← 返回助手</Link><span>MIND MAP · CYTOSCAPE</span></header>
    <section className="toolHero"><span>思维导图</span><h1>把校园知识整理成可视化层级图</h1><p>使用现有开源 Cytoscape.js，不额外依赖外部 SaaS。模型只负责把当前知识库证据整理成层级结构，前端负责可视化。</p></section>

    <section className="toolComposer">
      <select value={workspaceSlug} onChange={(event) => setWorkspaceSlug(event.target.value)}>{workspaces.map((item) => <option key={item.slug} value={item.slug}>{item.label}</option>)}</select>
      <textarea value={topic} onChange={(event) => setTopic(event.target.value)} placeholder="例如：近期校园活动、职业发展服务、图书馆资源使用流程…" />
      <button disabled={!topic.trim() || !workspaceSlug || busy} onClick={generate}>{busy ? "正在生成…" : "生成思维导图"}</button>
    </section>

    {error && <div className="toolError">{error}</div>}
    {map && <section className="mindCard">
      <div className="mindHead"><div><span>VISUAL MIND MAP</span><h2>{map.title}</h2><p>{map.summary}</p></div><div className="mindActions"><button onClick={() => cyRef.current?.fit(undefined, 36)}>适应视图</button><button onClick={() => cyRef.current?.layout({ name: "breadthfirst", directed: true, roots: `#${map.rootId}`, padding: 42, spacingFactor: 1.25 }).run()}>重新布局</button><button onClick={exportPng}>导出 PNG</button></div></div>
      <div className="mindMeta">{levelCounts.map(([level, count]) => <span key={level}>层级 {level}：{count}</span>)}</div>
      <div className="mindBody"><div ref={canvasRef} className="mindCanvas" /><aside className="mindDetail">{selectedNode ? <><span>SELECTED NODE</span><h3>{selectedNode.label}</h3>{selectedNode.detail && <p>{selectedNode.detail}</p>}<small>层级：{selectedNode.level}</small>{selectedCitation && <div className="sourceBox"><strong>来源 {selectedNode.sourceIndex}</strong><p>{selectedCitation.title}</p>{selectedCitation.publishedDate && <small>{selectedCitation.publishedDate}</small>}{selectedCitation.url && <a href={selectedCitation.url} target="_blank" rel="noreferrer">查看原文 ↗</a>}</div>}</> : <p>点击节点查看说明和来源。</p>}</aside></div>
    </section>}

    {citations.length > 0 && <section className="sourcePanel"><h2>参考来源</h2>{citations.map((item, index) => <article key={index}><strong>{index + 1}. {item.title}</strong>{item.source && <span>{item.source}</span>}{item.publishedDate && <span>{item.publishedDate}</span>}{item.url && <a href={item.url} target="_blank" rel="noreferrer">查看原文 ↗</a>}</article>)}</section>}

    <style jsx>{`
      .toolPage{min-height:100vh;background:#f6f7fa;color:#19232d;padding:0 28px 80px}.toolTop{height:70px;display:flex;align-items:center;justify-content:space-between;border-bottom:1px solid #e1e6eb}.toolTop a,.sourcePanel a,.sourceBox a{color:#5862d9;text-decoration:none;font-weight:700}.toolTop span,.toolHero>span,.mindHead span,.mindDetail>span{font-size:11px;letter-spacing:.13em;color:#6570dc;font-weight:800}.toolHero,.toolComposer,.mindCard,.sourcePanel,.toolError{max-width:1180px;margin-left:auto;margin-right:auto}.toolHero{margin-top:46px}.toolHero h1{font-size:34px;margin:8px 0}.toolHero p{color:#6f7b85;line-height:1.7}.toolComposer{display:grid;grid-template-columns:220px minmax(0,1fr) auto;gap:10px;background:#fff;border:1px solid #e0e5eb;border-radius:16px;padding:14px;margin-top:20px}.toolComposer select,.toolComposer textarea{border:1px solid #d9dfe7;border-radius:10px;padding:10px 12px;font:inherit;background:#fff}.toolComposer textarea{min-height:76px;resize:vertical}.toolComposer button,.mindActions button{border:0;border-radius:10px;background:#5b61e9;color:#fff;padding:10px 14px;font-weight:700;cursor:pointer}.toolComposer button:disabled{opacity:.45}.toolError{margin-top:16px;background:#fff0ef;color:#9b4d49;padding:14px 16px;border-radius:12px}.mindCard,.sourcePanel{margin-top:18px;background:#fff;border:1px solid #e1e6ec;border-radius:18px;overflow:hidden}.mindHead{padding:20px 22px;display:flex;justify-content:space-between;gap:18px;border-bottom:1px solid #e9edf1}.mindHead h2{margin:5px 0}.mindHead p{margin:0;color:#6d7882}.mindActions{display:flex;gap:7px;align-items:flex-start;flex-wrap:wrap}.mindActions button{background:#f1f2ff;color:#4f59d0;border:1px solid #dfe2fa;padding:8px 10px}.mindMeta{display:flex;gap:8px;padding:10px 22px;border-bottom:1px solid #edf0f4}.mindMeta span{font-size:11px;background:#f5f6fa;padding:5px 8px;border-radius:999px;color:#6e7882}.mindBody{display:grid;grid-template-columns:minmax(0,1fr) 260px;min-height:560px}.mindCanvas{min-height:560px;background:#fbfcfd}.mindDetail{border-left:1px solid #e7ebef;padding:20px}.mindDetail h3{margin:7px 0}.mindDetail p{line-height:1.65;color:#5f6c77}.mindDetail small{color:#8a949e}.sourceBox{margin-top:16px;background:#f5f6fb;border-radius:11px;padding:12px}.sourceBox p{margin:5px 0}.sourceBox a{display:block;margin-top:8px;font-size:12px}.sourcePanel{padding:22px}.sourcePanel h2{margin-top:0}.sourcePanel article{padding:12px 0;border-top:1px solid #edf0f3}.sourcePanel article:first-of-type{border-top:0}.sourcePanel article span{display:block;color:#7a8690;font-size:12px;margin-top:3px}.sourcePanel article a{display:inline-block;margin-top:6px;font-size:12px}@media(max-width:900px){.toolComposer{grid-template-columns:1fr}.mindBody{grid-template-columns:1fr}.mindDetail{border-left:0;border-top:1px solid #e7ebef}.mindHead{display:block}.mindActions{margin-top:14px}}@media(max-width:520px){.toolPage{padding-inline:14px}}
    `}</style>
  </main>;
}
