import dagre from '@dagrejs/dagre';
import type { Node, Edge } from '@xyflow/react';
import type { PipelineGraph } from '../types';

const NODE_WIDTH = 260;
const NODE_HEIGHT = 100;
const EXPANDED_NODE_WIDTH = 380;
const EXPANDED_NODE_HEIGHT = 460;
const MERGE_NODE_WIDTH = 100;
const MERGE_NODE_HEIGHT = 32;

/**
 * Apply dagre layout to pipeline graph nodes, returning positioned ReactFlow nodes/edges.
 * When expandedNodeId is provided, that node gets a larger bounding box so downstream
 * nodes are pushed further away, preventing overlap with the expanded charts.
 */
export function layoutGraph(
  graph: PipelineGraph,
  expandedNodeId?: string | null,
): { nodes: Node[]; edges: Edge[] } {
  const g = new dagre.graphlib.Graph();
  g.setDefaultEdgeLabel(() => ({}));
  g.setGraph({ rankdir: 'TB', nodesep: 60, ranksep: 80, marginx: 40, marginy: 40 });

  for (const node of graph.nodes) {
    const isExpanded = node.id === expandedNodeId;
    const isMerge = node.type === 'merge';
    g.setNode(node.id, {
      width: isExpanded ? EXPANDED_NODE_WIDTH : isMerge ? MERGE_NODE_WIDTH : NODE_WIDTH,
      height: isExpanded ? EXPANDED_NODE_HEIGHT : isMerge ? MERGE_NODE_HEIGHT : NODE_HEIGHT,
    });
  }

  for (const edge of graph.edges) {
    g.setEdge(edge.source, edge.target);
  }

  dagre.layout(g);

  const layoutedNodes: Node[] = graph.nodes.map((node) => {
    const pos = g.node(node.id);
    const isExpanded = node.id === expandedNodeId;
    const isMerge = node.type === 'merge';
    const w = isExpanded ? EXPANDED_NODE_WIDTH : isMerge ? MERGE_NODE_WIDTH : NODE_WIDTH;
    const h = isExpanded ? EXPANDED_NODE_HEIGHT : isMerge ? MERGE_NODE_HEIGHT : NODE_HEIGHT;
    return {
      id: node.id,
      type: 'pipelineNode',
      position: {
        x: (pos?.x ?? 0) - w / 2,
        y: (pos?.y ?? 0) - h / 2,
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

  const layoutedEdges: Edge[] = graph.edges.map((edge) => {
    const targetNode = graph.nodes.find((n) => n.id === edge.target);
    const isResourceEdge = targetNode?.type === 'cache' || targetNode?.type === 'rate_limit';

    const rfEdge: Edge = {
      id: edge.id,
      source: edge.source,
      target: edge.target,
      animated: !isResourceEdge,
      style: isResourceEdge
        ? { stroke: '#585b70', strokeWidth: 1.5, strokeDasharray: '6 3' }
        : { stroke: '#6b7280', strokeWidth: 2 },
    };

    if (edge.label) {
      rfEdge.label = edge.label;
      rfEdge.labelStyle = { fill: '#a6adc8', fontSize: 10, fontWeight: 500, fontFamily: "'JetBrains Mono', monospace" };
      rfEdge.labelBgStyle = { fill: '#1e1e2e', fillOpacity: 0.85 };
      rfEdge.labelBgPadding = [6, 3] as [number, number];
    }

    return rfEdge;
  });

  return { nodes: layoutedNodes, edges: layoutedEdges };
}
