import { useMemo, useCallback, type CSSProperties } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type Edge,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import PipelineNodeComponent from './PipelineNode';
import type { PipelineNodeData } from './PipelineNode';
import type { PipelineGraph as PipelineGraphType } from '../types';
import type { ComponentMetrics, MetricsTimePoint } from '../types';
import type { MetricsResult, MetricsHistory } from '../hooks/useBenthosMetrics';
import { layoutGraph } from '../utils/layoutGraph';

const nodeTypes: NodeTypes = {
  pipelineNode: PipelineNodeComponent,
};

/** Min / max stroke width for traffic-scaled edges */
const MIN_EDGE_WIDTH = 1.5;
const MAX_EDGE_WIDTH = 8;
/** Extra width added when an edge carries more messages than input_received */
const OVERFLOW_EXTRA_WIDTH = 2;

interface PipelineGraphProps {
  graph: PipelineGraphType;
  metrics?: MetricsResult;
  metricsHistory?: MetricsHistory;
  selectedNodeId?: string | null;
  onNodeClick?: (nodeId: string) => void;
}

/**
 * Resolve ComponentMetrics for a node (by metricPath, then by componentLabel).
 */
function resolveNodeMetrics(
  nodeData: PipelineNodeData,
  metrics: MetricsResult,
): ComponentMetrics | undefined {
  return (
    metrics.byPath.get(nodeData.metricPath) ??
    (nodeData.componentLabel ? metrics.byLabel.get(nodeData.componentLabel) : undefined)
  );
}

/**
 * Determine the traffic volume for an edge.
 * Uses the target node's `received` count first, falling back to the source's `sent`,
 * then to the target's `sent` (covers output nodes which only expose `output_sent`).
 * Returns undefined when no metrics are available for the edge.
 */
function edgeTraffic(
  sourceMetrics: ComponentMetrics | undefined,
  targetMetrics: ComponentMetrics | undefined,
): number | undefined {
  return targetMetrics?.received ?? sourceMetrics?.sent ?? targetMetrics?.sent;
}

/**
 * Build dynamically-styled edges based on traffic volume.
 *
 * – Width is proportional to the edge's traffic relative to the max observed traffic
 *   (typically the pipeline input's received count).
 * – Zero-traffic edges are highlighted with a dashed orange/red stroke.
 * – Edges carrying *more* messages than the pipeline's input_received get extra width
 *   (message splitting / fan-out).
 */
function buildStyledEdges(
  edges: Edge[],
  nodeMetricsMap: Map<string, ComponentMetrics>,
  maxInputReceived: number,
  graph: PipelineGraphType,
): Edge[] {
  // Build a set of resource node IDs (cache / rate_limit) so we can skip their edges
  const resourceNodeIds = new Set(
    graph.nodes.filter((n) => n.type === 'cache' || n.type === 'rate_limit').map((n) => n.id),
  );

  // Collect per-edge traffic values so we can compute the range
  const edgeTrafficValues: (number | undefined)[] = edges.map((edge) => {
    const srcM = nodeMetricsMap.get(edge.source);
    const tgtM = nodeMetricsMap.get(edge.target);
    return edgeTraffic(srcM, tgtM);
  });

  const maxTraffic = Math.max(
    maxInputReceived,
    ...edgeTrafficValues.filter((v): v is number => v !== undefined),
    1, // avoid division by zero
  );

  return edges.map((edge, i) => {
    const traffic = edgeTrafficValues[i];

    // Resource edges (to cache / rate_limit) keep their static dashed style
    if (resourceNodeIds.has(edge.target) || resourceNodeIds.has(edge.source)) {
      return edge;
    }

    // No metrics available – keep default style
    if (traffic === undefined) {
      return edge;
    }

    // Zero traffic – highlighted edge (filtered everything)
    if (traffic === 0) {
      return {
        ...edge,
        animated: false,
        style: {
          stroke: '#f97316', // orange-500
          strokeWidth: MIN_EDGE_WIDTH,
          strokeDasharray: '6 3',
          opacity: 0.85,
        },
        label: '0',
        labelStyle: { fill: '#f97316', fontSize: 11, fontWeight: 600 },
        labelBgStyle: { fill: '#1e1e2e', fillOpacity: 0.8 },
      };
    }

    // Proportional width
    const ratio = traffic / maxTraffic;
    let strokeWidth = MIN_EDGE_WIDTH + ratio * (MAX_EDGE_WIDTH - MIN_EDGE_WIDTH);

    // Overflow: edge carries more than the pipeline input received
    const isOverflow = maxInputReceived > 0 && traffic > maxInputReceived;
    if (isOverflow) {
      strokeWidth = MAX_EDGE_WIDTH + OVERFLOW_EXTRA_WIDTH;
    }

    return {
      ...edge,
      animated: true,
      style: {
        stroke: isOverflow ? '#38bdf8' : '#6b7280', // sky-400 for overflow, gray otherwise
        strokeWidth,
        transition: 'stroke-width 0.4s ease, stroke 0.4s ease',
      },
    };
  });
}

/**
 * Resolve the metrics history for a given node from the MetricsHistory maps.
 */
function resolveNodeHistory(
  nodeData: PipelineNodeData,
  history: MetricsHistory,
): MetricsTimePoint[] | undefined {
  return (
    history.byPath.get(nodeData.metricPath) ??
    (nodeData.componentLabel ? history.byLabel.get(nodeData.componentLabel) : undefined)
  );
}

export default function PipelineGraphView({ graph, metrics, metricsHistory, selectedNodeId, onNodeClick }: PipelineGraphProps) {
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => layoutGraph(graph, selectedNodeId),
    [graph, selectedNodeId],
  );

  // Build a map: nodeId → ComponentMetrics (used for both nodes and edges)
  const nodeMetricsMap = useMemo(() => {
    const map = new Map<string, ComponentMetrics>();
    if (!metrics) return map;
    for (const node of layoutedNodes) {
      const nd = node.data as unknown as PipelineNodeData;
      const m = resolveNodeMetrics(nd, metrics);
      if (m) map.set(node.id, m);
    }
    return map;
  }, [layoutedNodes, metrics]);

  // Inject metrics, selected state, and history into node data
  const nodesWithMetrics = useMemo(() => {
    return layoutedNodes.map((node) => {
      const m = metrics ? nodeMetricsMap.get(node.id) : undefined;
      const nd = node.data as unknown as PipelineNodeData;
      const isSelected = node.id === selectedNodeId;
      const history = metricsHistory ? resolveNodeHistory(nd, metricsHistory) : undefined;

      return {
        ...node,
        data: {
          ...node.data,
          ...(m ? { metrics: m } : {}),
          selected: isSelected,
          metricsHistory: history,
        },
      };
    });
  }, [layoutedNodes, nodeMetricsMap, metrics, selectedNodeId, metricsHistory]);

  // Find the pipeline's input_received (max received across input nodes)
  const maxInputReceived = useMemo(() => {
    let max = 0;
    for (const node of layoutedNodes) {
      const nd = node.data as unknown as PipelineNodeData;
      if (nd.nodeType === 'input') {
        const m = nodeMetricsMap.get(node.id);
        if (m?.received !== undefined && m.received > max) max = m.received;
      }
    }
    return max;
  }, [layoutedNodes, nodeMetricsMap]);

  // Style edges based on traffic volume
  const styledEdges = useMemo(
    () => (metrics ? buildStyledEdges(layoutedEdges, nodeMetricsMap, maxInputReceived, graph) : layoutedEdges),
    [layoutedEdges, nodeMetricsMap, maxInputReceived, metrics, graph],
  );

  const [, , onNodesChange] = useNodesState(nodesWithMetrics);
  const [, , onEdgesChange] = useEdgesState(styledEdges);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onNodeClick?.(node.id);
  }, [onNodeClick]);

  return (
    <div style={containerStyle}>
      <ReactFlow
        nodes={nodesWithMetrics}
        edges={styledEdges}
        nodeTypes={nodeTypes}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onNodeClick={handleNodeClick}
        fitView
        fitViewOptions={{ padding: 0.2 }}
        proOptions={{ hideAttribution: true }}
        minZoom={0.3}
        maxZoom={2}
      >
        <Background color="#313244" gap={20} />
        <Controls
          style={{ background: '#1e1e2e', borderColor: '#45475a' }}
        />
        <MiniMap
          nodeColor={(node) => {
            const nd = node.data as unknown as PipelineNodeData;
            const colors: Record<string, string> = {
              input: '#3b82f6',
              processor: '#8b5cf6',
              output: '#10b981',
              cache: '#f59e0b',
              rate_limit: '#ef4444',
            };
            return colors[nd.nodeType] ?? '#6b7280';
          }}
          maskColor="rgba(0,0,0,0.6)"
          style={{ background: '#181825' }}
        />
      </ReactFlow>
    </div>
  );
}

const containerStyle: CSSProperties = {
  width: '100%',
  height: '100%',
  background: '#11111b',
};
