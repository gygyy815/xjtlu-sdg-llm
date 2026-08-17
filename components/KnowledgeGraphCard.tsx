"use client";

export type GraphNode = {
  id: string;
  label: string;
  type: "topic" | "activity" | "department" | "audience" | "location" | "time";
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

const columns: Record<GraphNode["type"], { x: number; title: string }> = {
  activity: { x: 90, title: "活动" },
  time: { x: 90, title: "时间" },
  topic: { x: 330, title: "主题" },
  department: { x: 570, title: "部门" },
  audience: { x: 810, title: "受众" },
  location: { x: 810, title: "地点" },
};

function layoutNodes(nodes: GraphNode[]) {
  const byType = new Map<string, GraphNode[]>();
  for (const node of nodes) {
    const list = byType.get(node.type) || [];
    list.push(node);
    byType.set(node.type, list);
  }

  const positions = new Map<string, { x: number; y: number }>();
  for (const [type, list] of byType.entries()) {
    const base = columns[type as GraphNode["type"]]?.x ?? 450;
    const startY = 92 + Math.max(0, (4 - list.length) * 26);
    list.forEach((node, index) => positions.set(node.id, { x: base, y: startY + index * 82 }));
  }
  return positions;
}

export function KnowledgeGraphCard({ graph }: { graph: KnowledgeGraph }) {
  const nodes = graph.nodes.slice(0, 18);
  const nodeIds = new Set(nodes.map((node) => node.id));
  const edges = graph.edges.filter((edge) => nodeIds.has(edge.source) && nodeIds.has(edge.target)).slice(0, 30);
  const positions = layoutNodes(nodes);

  return (
    <section className="graphCard">
      <div className="graphHeader">
        <div><span>KNOWLEDGE GRAPH</span><h3>{graph.title || "知识关系图"}</h3></div>
        <small>{nodes.length} 个节点 · {edges.length} 条关系</small>
      </div>
      <div className="graphCanvas" role="img" aria-label="知识图谱关系图">
        <svg viewBox="0 0 920 430" preserveAspectRatio="xMidYMid meet">
          <defs>
            <marker id="arrow" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8 z" /></marker>
          </defs>
          {edges.map((edge, index) => {
            const a = positions.get(edge.source);
            const b = positions.get(edge.target);
            if (!a || !b) return null;
            const midX = (a.x + b.x) / 2;
            const midY = (a.y + b.y) / 2;
            return <g key={`${edge.source}-${edge.target}-${index}`}>
              <line x1={a.x + 72} y1={a.y} x2={b.x - 72} y2={b.y} className="graphEdge" markerEnd="url(#arrow)" />
              <text x={midX} y={midY - 5} className="graphEdgeLabel">{edge.label}</text>
            </g>;
          })}
          {nodes.map((node) => {
            const point = positions.get(node.id);
            if (!point) return null;
            return <g key={node.id} className={`graphNode ${node.type}`} transform={`translate(${point.x - 72} ${point.y - 24})`}>
              <rect width="144" height="48" rx="12" />
              <text x="72" y="29" textAnchor="middle">{node.label.length > 11 ? `${node.label.slice(0, 10)}…` : node.label}</text>
              <title>{node.label}</title>
            </g>;
          })}
        </svg>
      </div>
      <div className="graphLegend">
        <span><i className="activity" />活动</span><span><i className="topic" />主题</span><span><i className="department" />部门</span><span><i className="audience" />受众</span><span><i className="location" />地点</span><span><i className="time" />时间</span>
      </div>
      <p className="graphSummary">{graph.summary}</p>
    </section>
  );
}
