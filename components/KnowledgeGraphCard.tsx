"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { type Core, type ElementDefinition, type Position } from "cytoscape";

export type GraphNode = { id: string; label: string; type: "article" | "activity" | "department" | "audience" | "location" | "time"; sourceIndex?: number; detail?: string; sourceTitle?: string; sourceUrl?: string; sourceName?: string; publishedDate?: string; sourceText?: string };
export type GraphEdge = { source: string; target: string; label: string };
export type KnowledgeGraph = { title: string; summary: string; nodes: GraphNode[]; edges: GraphEdge[] };
type Citation = { title: string; text?: string; url?: string; source?: string; publishedDate?: string };

const names: Record<GraphNode["type"], string> = { article: "文章", activity: "活动", department: "部门", audience: "受众", location: "地点", time: "时间" };

function shortLabel(node: GraphNode) {
  if (node.type === "article") return node.sourceIndex ? `来源 ${node.sourceIndex}` : "来源文章";
  const n = node.type === "activity" ? 16 : 12;
  return node.label.length > n ? `${node.label.slice(0, n - 1)}…` : node.label;
}

function buildPositions(nodes: GraphNode[], edges: GraphEdge[]) {
  const map = new Map<string, Position>();
  const activities = nodes.filter((n) => n.type === "activity");
  const offsets: Record<string, Position> = { article: { x: -300, y: -105 }, time: { x: -300, y: 105 }, department: { x: 300, y: -125 }, audience: { x: 300, y: 0 }, location: { x: 300, y: 125 } };
  activities.forEach((activity, i) => {
    const center = { x: 420, y: 180 + i * 300 };
    map.set(activity.id, center);
    const neighbors = nodes.filter((node) => node.id !== activity.id && edges.some((e) => (e.source === activity.id && e.target === node.id) || (e.target === activity.id && e.source === node.id)));
    const grouped = new Map<string, GraphNode[]>();
    neighbors.forEach((node) => grouped.set(node.type, [...(grouped.get(node.type) || []), node]));
    grouped.forEach((list, type) => list.forEach((node, j) => {
      if (map.has(node.id) || type === "activity") return;
      const o = offsets[type] || { x: 0, y: 0 };
      map.set(node.id, { x: center.x + o.x, y: center.y + o.y + (j - (list.length - 1) / 2) * 80 });
    }));
  });
  nodes.forEach((node, i) => { if (!map.has(node.id)) map.set(node.id, { x: 110 + (i % 3) * 300, y: 120 + Math.floor(i / 3) * 120 }); });
  return map;
}

export function KnowledgeGraphCard({ graph, citations = [] }: { graph: KnowledgeGraph; citations?: Citation[] }) {
  const host = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [filter, setFilter] = useState<GraphNode["type"] | "all">("all");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState("");
  const nodes = useMemo(() => graph.nodes.slice(0, 24), [graph.nodes]);
  const ids = useMemo(() => new Set(nodes.map((n) => n.id)), [nodes]);
  const edges = useMemo(() => graph.edges.filter((e) => ids.has(e.source) && ids.has(e.target)).slice(0, 45), [graph.edges, ids]);
  const positions = useMemo(() => buildPositions(nodes, edges), [nodes, edges]);
  const selected = nodes.find((n) => n.id === selectedId);
  const fallback = selected?.sourceIndex ? citations[selected.sourceIndex - 1] : undefined;

  function fit() {
    const cy = cyRef.current; if (!cy) return;
    cy.resize();
    const visible = cy.elements(":visible");
    if (visible.length) { cy.fit(visible, 70); cy.center(visible); }
  }
  function reset() {
    const cy = cyRef.current; if (!cy) return;
    cy.elements().removeClass("dimmed focusDim"); cy.$(":selected").unselect(); setFilter("all"); setSelectedId(null);
    cy.layout({ name: "preset", positions: (n) => positions.get(n.id()) || { x: 420, y: 200 }, animate: true, animationDuration: 250, fit: false }).run();
    window.setTimeout(fit, 300); setNotice("已恢复默认视图"); window.setTimeout(() => setNotice(""), 1200);
  }
  function zoom(multiplier: number) {
    const cy = cyRef.current; if (!cy) return;
    cy.zoom({ level: Math.max(cy.minZoom(), Math.min(cy.maxZoom(), cy.zoom() * multiplier)), renderedPosition: { x: cy.width() / 2, y: cy.height() / 2 } });
  }

  useEffect(() => {
    if (!host.current) return;
    const elements: ElementDefinition[] = [
      ...nodes.map((n) => ({ data: { id: n.id, label: shortLabel(n), type: n.type }, position: positions.get(n.id) })),
      ...edges.map((e, i) => ({ data: { id: `e${i}`, source: e.source, target: e.target, label: e.label } })),
    ];
    const cy = cytoscape({ container: host.current, elements, layout: { name: "preset", fit: false }, minZoom: .35, maxZoom: 2.5, wheelSensitivity: .18, style: [
      { selector: "node", style: { label: "data(label)", "text-wrap": "wrap", "text-max-width": "115px", "font-size": 11, color: "#25323a", width: 74, height: 74, "border-width": 1.5, "background-color": "#eef2ff", "border-color": "#aab7f7" } },
      { selector: "node[type='article']", style: { shape: "round-rectangle", width: 88, height: 50, "background-color": "#ede9fe", "border-color": "#9f8ee8" } },
      { selector: "node[type='activity']", style: { width: 104, height: 104, "font-size": 12, "background-color": "#e7f7ee", "border-color": "#65ad82" } },
      { selector: "node[type='department']", style: { "background-color": "#e8f0ff", "border-color": "#7fa3ed" } },
      { selector: "node[type='audience']", style: { "background-color": "#f3eaff", "border-color": "#b28adf" } },
      { selector: "node[type='location']", style: { "background-color": "#fff3e6", "border-color": "#d99b57" } },
      { selector: "node[type='time']", style: { "background-color": "#e8f6f7", "border-color": "#7fb7bc" } },
      { selector: "edge", style: { label: "data(label)", "font-size": 9, width: 1.4, "line-color": "#b7c2cb", "target-arrow-color": "#9aa8b2", "target-arrow-shape": "triangle", "curve-style": "bezier", color: "#64727c", "text-background-color": "#fff", "text-background-opacity": .92, "text-background-padding": "3px" } },
      { selector: ".dimmed", style: { opacity: .12 } }, { selector: ".focusDim", style: { opacity: .14 } }, { selector: ":selected", style: { "border-width": 4, "border-color": "#4f67e8" } }
    ] });
    cyRef.current = cy;
    cy.on("tap", "node", (event) => { const node = event.target; setSelectedId(node.id()); cy.elements().removeClass("focusDim"); cy.elements().difference(node.closedNeighborhood()).addClass("focusDim"); });
    cy.on("tap", (event) => { if (event.target === cy) { cy.elements().removeClass("focusDim"); setSelectedId(null); } });
    const timer = window.setTimeout(fit, 80); const ro = new ResizeObserver(() => cy.resize()); ro.observe(host.current);
    return () => { window.clearTimeout(timer); ro.disconnect(); cy.destroy(); cyRef.current = null; };
  }, [nodes, edges, positions]);

  useEffect(() => {
    const cy = cyRef.current; if (!cy) return; cy.elements().removeClass("dimmed");
    if (filter !== "all") { cy.nodes().forEach((n) => { if (n.data("type") !== filter) n.addClass("dimmed"); }); cy.edges().forEach((e) => { if (e.source().data("type") !== filter && e.target().data("type") !== filter) e.addClass("dimmed"); }); }
  }, [filter]);

  const title = selected?.sourceTitle || fallback?.title;
  const source = selected?.sourceName || fallback?.source;
  const date = selected?.publishedDate || fallback?.publishedDate;
  const url = selected?.sourceUrl || fallback?.url;

  return <section className="graphCard interactiveGraphCard">
    <div className="graphHeader"><div><span>KNOWLEDGE GRAPH</span><h3>{graph.title}</h3></div><small>{nodes.length} 个节点 · {edges.length} 条关系</small></div>
    <div className="graphToolbar"><div className="graphFilters"><button className={filter === "all" ? "active" : ""} onClick={() => setFilter("all")}>全部</button>{(Object.keys(names) as GraphNode["type"][]).map((t) => <button key={t} className={filter === t ? "active" : ""} onClick={() => setFilter(t)}>{names[t]}</button>)}</div><div className="graphViewActions"><button onClick={() => zoom(.82)}>−</button><button onClick={() => zoom(1.22)}>＋</button><button className="graphReset" onClick={reset}>重置视图</button>{notice && <span className="graphViewNotice">{notice}</span>}</div></div>
    <div className="graphWorkspace"><div className="graphCanvasPane"><div ref={host} className="cyGraphCanvas" /></div><aside className="graphInspector">{selected ? <><span className={`graphTypeBadge ${selected.type}`}>{names[selected.type]}</span><h4>{selected.label}</h4>{selected.detail && <p>{selected.detail}</p>}<div className="graphEvidence"><strong>来源证据</strong><span>{title || "未绑定单一来源"}</span>{source && <small>{source}</small>}{date && <small>发布日期：{date}</small>}{url && <a href={url} target="_blank" rel="noreferrer">查看原文 ↗</a>}</div></> : <div className="graphInspectorEmpty"><strong>点击任一节点</strong><p>查看完整实体名称、证据和文章来源。</p></div>}</aside></div>
    <div className="graphLegend">{(Object.keys(names) as GraphNode["type"][]).map((t) => <span key={t}><i className={t}/>{names[t]}</span>)}</div><p className="graphSummary">{graph.summary}</p>
  </section>;
}
