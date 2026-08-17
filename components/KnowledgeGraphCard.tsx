"use client";

import "./KnowledgeGraphCard.css";
import { useEffect, useMemo, useRef, useState } from "react";
import cytoscape, { type Core, type ElementDefinition } from "cytoscape";

export type GraphNode = {
  id: string;
  label: string;
  type: "article" | "activity" | "department" | "audience" | "location" | "time";
  sourceIndex?: number;
  detail?: string;
};

export type GraphEdge = {
  source: string;
  target: string;
  label: string;
};

export type KnowledgeGraph = {
  title: string;
  summary: string;
  nodes: GraphNode[];
  edges: GraphEdge[];
};

type Citation = {
  title: string;
  text?: string;
  url?: string;
  source?: string;
  publishedDate?: string;
};

const nodeLabels: Record<GraphNode["type"], string> = {
  article: "文章",
  activity: "活动",
  department: "部门",
  audience: "受众",
  location: "地点",
  time: "时间",
};

export function KnowledgeGraphCard({ graph, citations = [] }: { graph: KnowledgeGraph; citations?: Citation[] }) {
  const containerRef = useRef<HTMLDivElement>(null);
  const cyRef = useRef<Core | null>(null);
  const [selectedType, setSelectedType] = useState<GraphNode["type"] | "all">("all");
  const [selectedNodeId, setSelectedNodeId] = useState<string | null>(null);

  const nodes = useMemo(() => graph.nodes.slice(0, 24), [graph.nodes]);
  const nodeIds = useMemo(() => new Set(nodes.map((node) => node.id)), [nodes]);
  const edges = useMemo(
    () => graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)).slice(0, 45),
    [graph.edges, nodeIds],
  );
  const selectedNode = nodes.find((node) => node.id === selectedNodeId) || null;
  const selectedCitation = selectedNode?.sourceIndex ? citations[selectedNode.sourceIndex - 1] : undefined;

  useEffect(() => {
    if (!containerRef.current) return;

    const elements: ElementDefinition[] = [
      ...nodes.map((node) => ({ data: { id: node.id, label: node.label, type: node.type } })),
      ...edges.map((edge, index) => ({
        data: { id: `e-${index}-${edge.source}-${edge.target}`, source: edge.source, target: edge.target, label: edge.label },
      })),
    ];

    const cy = cytoscape({
      container: containerRef.current,
      elements,
      minZoom: 0.35,
      maxZoom: 2.2,
      wheelSensitivity: 0.2,
      layout: { name: "cose", animate: false, fit: true, padding: 36, nodeRepulsion: () => 6500, idealEdgeLength: () => 120 },
      style: [
        {
          selector: "node",
          style: {
            label: "data(label)",
            "text-wrap": "wrap",
            "text-max-width": "105px",
            "font-size": 11,
            color: "#25323a",
            "background-color": "#eef2ff",
            "border-color": "#aab7f7",
            "border-width": 1.5,
            width: 66,
            height: 66,
          },
        },
        { selector: "node[type = 'article']", style: { "background-color": "#ede9fe", "border-color": "#9f8ee8", shape: "round-rectangle", width: 90 } },
        { selector: "node[type = 'activity']", style: { "background-color": "#e7f7ee", "border-color": "#79bf99" } },
        { selector: "node[type = 'department']", style: { "background-color": "#e8f0ff", "border-color": "#7fa3ed" } },
        { selector: "node[type = 'audience']", style: { "background-color": "#f3eaff", "border-color": "#b28adf" } },
        { selector: "node[type = 'location']", style: { "background-color": "#fff3e6", "border-color": "#d99b57" } },
        { selector: "node[type = 'time']", style: { "background-color": "#e8f6f7", "border-color": "#7fb7bc" } },
        {
          selector: "edge",
          style: {
            width: 1.3,
            "line-color": "#b9c3cb",
            "target-arrow-color": "#9aa8b2",
            "target-arrow-shape": "triangle",
            "curve-style": "bezier",
            label: "data(label)",
            "font-size": 9,
            color: "#66757e",
            "text-background-color": "#ffffff",
            "text-background-opacity": 0.85,
            "text-background-padding": "2px",
          },
        },
        { selector: ".dimmed", style: { opacity: 0.12 } },
        { selector: ":selected", style: { "border-width": 4, "border-color": "#4f67e8" } },
      ],
    });

    cy.on("tap", "node", (event) => setSelectedNodeId(event.target.id()));
    cy.on("tap", (event) => {
      if (event.target === cy) setSelectedNodeId(null);
    });
    cyRef.current = cy;

    return () => {
      cy.destroy();
      cyRef.current = null;
    };
  }, [nodes, edges]);

  useEffect(() => {
    const cy = cyRef.current;
    if (!cy) return;
    cy.elements().removeClass("dimmed");
    if (selectedType === "all") return;
    cy.nodes().forEach((node) => {
      if (node.data("type") !== selectedType) node.addClass("dimmed");
    });
    cy.edges().forEach((edge) => {
      if (edge.source().data("type") !== selectedType && edge.target().data("type") !== selectedType) edge.addClass("dimmed");
    });
  }, [selectedType]);

  function resetView() {
    const cy = cyRef.current;
    if (!cy) return;
    cy.fit(undefined, 36);
    cy.center();
  }

  return (
    <section className="graphCard interactiveGraphCard">
      <div className="graphHeader">
        <div><span>KNOWLEDGE GRAPH</span><h3>{graph.title || "知识关系图"}</h3></div>
        <small>{nodes.length} 个节点 · {edges.length} 条关系</small>
      </div>

      <div className="graphToolbar">
        <div className="graphFilters">
          <button type="button" className={selectedType === "all" ? "active" : ""} onClick={() => setSelectedType("all")}>全部</button>
          {(Object.keys(nodeLabels) as GraphNode["type"][]).map((type) => (
            <button type="button" key={type} className={selectedType === type ? "active" : ""} onClick={() => setSelectedType(type)}>{nodeLabels[type]}</button>
          ))}
        </div>
        <button type="button" className="graphReset" onClick={resetView}>适应视图</button>
      </div>

      <div className="graphWorkspace">
        <div ref={containerRef} className="cyGraphCanvas" aria-label="可交互知识图谱" />
        <aside className="graphInspector">
          {selectedNode ? <>
            <span className={`graphTypeBadge ${selectedNode.type}`}>{nodeLabels[selectedNode.type]}</span>
            <h4>{selectedNode.label}</h4>
            {selectedNode.detail && <p>{selectedNode.detail}</p>}
            {selectedCitation && <div className="graphEvidence">
              <strong>来源证据</strong>
              <span>{selectedCitation.title}</span>
              {selectedCitation.source && <small>{selectedCitation.source}</small>}
              {selectedCitation.publishedDate && <small>发布日期：{selectedCitation.publishedDate}</small>}
              {selectedCitation.url && <a href={selectedCitation.url} target="_blank" rel="noreferrer">查看原文 ↗</a>}
            </div>}
          </> : <div className="graphInspectorEmpty"><strong>点击任一节点</strong><p>查看实体类型、说明和关联文章来源。</p></div>}
        </aside>
      </div>

      <div className="graphLegend">
        {(Object.keys(nodeLabels) as GraphNode["type"][]).map((type) => <span key={type}><i className={type} />{nodeLabels[type]}</span>)}
      </div>
      <p className="graphSummary">{graph.summary}</p>
    </section>
  );
}
