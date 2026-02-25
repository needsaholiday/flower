import { useMemo, useCallback, type CSSProperties } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  useNodesState,
  useEdgesState,
  type NodeTypes,
  type Node,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import PipelineNodeComponent from './PipelineNode';
import type { PipelineNodeData } from './PipelineNode';
import type { PipelineGraph as PipelineGraphType } from '../types';
import type { MetricsResult } from '../hooks/useBenthosMetrics';
import { layoutGraph } from '../utils/layoutGraph';

const nodeTypes: NodeTypes = {
  pipelineNode: PipelineNodeComponent,
};

interface PipelineGraphProps {
  graph: PipelineGraphType;
  metrics?: MetricsResult;
  onNodeClick?: (nodeId: string) => void;
}

export default function PipelineGraphView({ graph, metrics, onNodeClick }: PipelineGraphProps) {
  const { nodes: layoutedNodes, edges: layoutedEdges } = useMemo(
    () => layoutGraph(graph),
    [graph],
  );

  // Inject metrics into node data, matching by path first then by component label
  const nodesWithMetrics = useMemo(() => {
    if (!metrics) return layoutedNodes;
    return layoutedNodes.map((node) => {
      const nodeData = node.data as unknown as PipelineNodeData;
      const nodeMetrics =
        metrics.byPath.get(nodeData.metricPath) ??
        (nodeData.componentLabel ? metrics.byLabel.get(nodeData.componentLabel) : undefined);
      if (nodeMetrics) {
        return {
          ...node,
          data: { ...node.data, metrics: nodeMetrics },
        };
      }
      return node;
    });
  }, [layoutedNodes, metrics]);

  const [, , onNodesChange] = useNodesState(nodesWithMetrics);
  const [, , onEdgesChange] = useEdgesState(layoutedEdges);

  const handleNodeClick = useCallback((_: React.MouseEvent, node: Node) => {
    onNodeClick?.(node.id);
  }, [onNodeClick]);

  return (
    <div style={containerStyle}>
      <ReactFlow
        nodes={nodesWithMetrics}
        edges={layoutedEdges}
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
