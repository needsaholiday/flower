import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';
import type { PipelineGraph } from '../types';

const NODE_WIDTH = 260;
const NODE_HEIGHT = 100;

/**
 * Apply dagre layout to pipeline graph nodes, returning positioned ReactFlow nodes/edges.
 */
export function layoutGraph(
  graph: PipelineGraph,
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80, marginx: 40, marginy: 40 });

  // Add nodes
  for (const node of graph.nodes) {
    g.setNode(node.id, { width: NODE_WIDTH, height: NODE_HEIGHT });
  }

  // Add edges
  for (const edge of graph.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutedNodes: Node[] = graph.nodes.map((node) => {
    const pos = g.node(node.id);
    return {
      id: node.id,
      type: 'pipelineNode',
      position: {
        x: (pos?.x ?? 0) - NODE_WIDTH / 2,
        y: (pos?.y ?? 0) - NODE_HEIGHT / 2,
      },
      data: {
        label: node.label,
        nodeType: node.type,
        componentType: node.componentType,
        metricPath: node.metricPath,
        componentLabel: node.componentLabel,
        config: node.config,
      },
    };
  });

  const layoutedEdges: Edge[] = graph.edges.map((edge) => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    animated: true,
    style: { stroke: '#6b7280', strokeWidth: 2 },
  }));

  return { nodes: layoutedNodes, edges: layoutedEdges };
}
