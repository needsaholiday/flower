import { useState, useCallback, type CSSProperties } from 'react';
import { ReactFlowProvider } from '@xyflow/react';
import { useTargets } from './hooks/useTargets';
import { useBenthosConfig } from './hooks/useBenthosConfig';
import { useBenthosMetrics } from './hooks/useBenthosMetrics';
import { useRuntimeMetrics } from './hooks/useRuntimeMetrics';
import TargetList from './components/TargetList';
import PipelineGraphView from './components/PipelineGraph';
import MetricsPanel from './components/MetricsPanel';
import RuntimeMetricsPanel from './components/RuntimeMetricsPanel';
import type { PipelineNodeData } from './components/PipelineNode';
import type { PipelineGraph } from './types';

function findNodeData(graph: PipelineGraph | undefined, nodeId: string): PipelineNodeData | null {
  if (!graph) return null;
  const node = graph.nodes.find((n) => n.id === nodeId);
  if (!node) return null;
  return {
    label: node.label,
    nodeType: node.type,
    componentType: node.componentType,
    metricPath: node.metricPath,
    componentLabel: node.componentLabel,
    config: node.config,
  };
}

export default function App() {
  const [selectedTarget, setSelectedTarget] = useState<string | null>(null);
  const [selectedNode, setSelectedNode] = useState<string | null>(null);

  const { data: targets, isLoading: targetsLoading, error: targetsError } = useTargets();
  const { data: graph, isLoading: configLoading, error: configError } = useBenthosConfig(selectedTarget);
  const { data: metrics, history: metricsHistory } = useBenthosMetrics(selectedTarget);
  const { data: runtimeSnapshots } = useRuntimeMetrics(selectedTarget);

  const handleTargetSelect = useCallback((name: string) => {
    setSelectedTarget(name);
    setSelectedNode(null);
  }, []);

  const handleNodeClick = useCallback((nodeId: string) => {
    setSelectedNode((prev) => prev === nodeId ? null : nodeId);
  }, []);

  const handleClosePanel = useCallback(() => {
    setSelectedNode(null);
  }, []);

  const selectedNodeData = findNodeData(graph, selectedNode ?? '');
  const selectedNodeMetrics = selectedNode && selectedNodeData && metrics
    ? (metrics.byPath.get(selectedNodeData.metricPath) ??
       (selectedNodeData.componentLabel ? metrics.byLabel.get(selectedNodeData.componentLabel) : undefined))
    : undefined;

  return (
    <div style={appStyle}>
      {/* Sidebar */}
      {targetsLoading ? (
        <div style={sidebarPlaceholder}>Loading targets…</div>
      ) : targetsError ? (
        <div style={{ ...sidebarPlaceholder, color: '#ef4444' }}>
          Failed to load targets
          <br />
          <small>{String(targetsError)}</small>
        </div>
      ) : (
        <TargetList
          targets={targets ?? []}
          selected={selectedTarget}
          onSelect={handleTargetSelect}
        />
      )}

      {/* Main content */}
      <div style={mainStyle}>
        {!selectedTarget ? (
          <div style={emptyStateStyle}>
            <div style={emptyIconStyle}>🔍</div>
            <h2 style={emptyTitleStyle}>Select a Pipeline</h2>
            <p style={emptyDescStyle}>
              Choose a Redpanda Connect instance from the sidebar to visualize its pipeline DAG and live metrics.
            </p>
          </div>
        ) : configLoading ? (
          <div style={emptyStateStyle}>
            <div style={spinnerStyle}>⏳</div>
            <p style={emptyDescStyle}>Loading pipeline configuration…</p>
          </div>
        ) : configError ? (
          <div style={emptyStateStyle}>
            <div style={emptyIconStyle}>⚠️</div>
            <h2 style={emptyTitleStyle}>Failed to Load Config</h2>
            <p style={emptyDescStyle}>
              {String(configError)}
            </p>
            <p style={{ ...emptyDescStyle, fontSize: 12, marginTop: 8 }}>
              Make sure debug_endpoints is enabled on the target instance.
            </p>
          </div>
        ) : graph ? (
          <>
            <div style={graphAreaStyle}>
              <ReactFlowProvider>
                <PipelineGraphView
                  graph={graph}
                  metrics={metrics}
                  metricsHistory={metricsHistory}
                  selectedNodeId={selectedNode}
                  onNodeClick={handleNodeClick}
                />
              </ReactFlowProvider>
            </div>
            <RuntimeMetricsPanel snapshots={runtimeSnapshots ?? []} />
          </>
        ) : null}
      </div>

      {/* Detail panel */}
      {selectedNode && selectedNodeData && (
        <MetricsPanel
          nodeData={selectedNodeData}
          metrics={selectedNodeMetrics}
          onClose={handleClosePanel}
        />
      )}
    </div>
  );
}

// --- Styles ---

const appStyle: CSSProperties = {
  display: 'flex',
  height: '100vh',
  width: '100vw',
  overflow: 'hidden',
  background: '#11111b',
  color: '#cdd6f4',
  fontFamily: "'Inter', system-ui, -apple-system, sans-serif",
};

const sidebarPlaceholder: CSSProperties = {
  width: 280,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  textAlign: 'center',
  padding: 20,
  background: '#181825',
  borderRight: '1px solid #313244',
  color: '#9399b2',
  fontSize: 13,
  flexShrink: 0,
};

const mainStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
};

const graphAreaStyle: CSSProperties = {
  flex: 1,
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  overflow: 'hidden',
};

const emptyStateStyle: CSSProperties = {
  textAlign: 'center',
  padding: 40,
  maxWidth: 400,
};

const emptyIconStyle: CSSProperties = {
  fontSize: 48,
  marginBottom: 16,
};

const emptyTitleStyle: CSSProperties = {
  margin: '0 0 8px',
  fontSize: 20,
  fontWeight: 600,
  color: '#cdd6f4',
};

const emptyDescStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  color: '#6c7086',
  lineHeight: 1.5,
};

const spinnerStyle: CSSProperties = {
  fontSize: 32,
  marginBottom: 16,
  animation: 'spin 1s linear infinite',
};
