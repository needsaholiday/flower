import { memo, type CSSProperties } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ComponentMetrics } from '../types';
import { formatCount, formatLatency, formatRate } from '../utils/metricsParser';

export interface PipelineNodeData {
  label: string;
  nodeType: 'input' | 'processor' | 'output' | 'cache' | 'rate_limit';
  componentType: string;
  metricPath: string;
  componentLabel?: string;
  metrics?: ComponentMetrics;
  config?: Record<string, unknown>;
}

const TYPE_COLORS: Record<string, string> = {
  input: '#3b82f6',
  processor: '#8b5cf6',
  output: '#10b981',
  cache: '#f59e0b',
  rate_limit: '#ef4444',
};

const TYPE_ICONS: Record<string, string> = {
  input: '📥',
  processor: '⚙️',
  output: '📤',
  cache: '💾',
  rate_limit: '🚦',
};

function MetricsBadge({ metrics, nodeType }: { metrics?: ComponentMetrics; nodeType: string }) {
  if (!metrics) return null;

  const hasErrors = (metrics.error ?? 0) > 0;
  const isConnected = metrics.connectionUp === 1;

  return (
    <div style={badgeContainerStyle}>
      {nodeType === 'input' && (
        <span style={badgeStyle} title="Received">
          ↓ {formatCount(metrics.received)}
        </span>
      )}
      {nodeType === 'input' && metrics.receivedRate !== undefined && (
        <span style={rateBadgeStyle} title="Receive rate">
          ⚡ {formatRate(metrics.receivedRate)}
        </span>
      )}
      {nodeType === 'processor' && (
        <>
          <span style={badgeStyle} title="Received → Sent">
            {formatCount(metrics.received)} → {formatCount(metrics.sent)}
          </span>
        </>
      )}
      {nodeType === 'processor' && metrics.sentRate !== undefined && (
        <span style={rateBadgeStyle} title="Throughput rate">
          ⚡ {formatRate(metrics.sentRate)}
        </span>
      )}
      {nodeType === 'output' && (
        <span style={badgeStyle} title="Sent">
          ↑ {formatCount(metrics.sent)}
        </span>
      )}
      {nodeType === 'output' && metrics.sentRate !== undefined && (
        <span style={rateBadgeStyle} title="Send rate">
          ⚡ {formatRate(metrics.sentRate)}
        </span>
      )}
      {nodeType === 'cache' && (
        <span style={badgeStyle} title="Sent">
          ↕ {formatCount(metrics.sent)}
        </span>
      )}
      {metrics.latencyNs !== undefined && (
        <span style={badgeStyle} title="p99 Latency">
          ⏱ {formatLatency(metrics.latencyNs)}
        </span>
      )}
      {hasErrors && (
        <span style={{ ...badgeStyle, color: '#ef4444' }} title="Errors">
          ⚠ {formatCount(metrics.error)}
        </span>
      )}
      {(nodeType === 'input' || nodeType === 'output') && metrics.connectionUp !== undefined && (
        <span
          style={{
            ...badgeStyle,
            color: isConnected ? '#10b981' : '#ef4444',
          }}
          title={isConnected ? 'Connected' : 'Disconnected'}
        >
          {isConnected ? '●' : '○'}
        </span>
      )}
    </div>
  );
}

function PipelineNodeComponent({ data }: NodeProps) {
  const nodeData = data as unknown as PipelineNodeData;
  const color = TYPE_COLORS[nodeData.nodeType] ?? '#6b7280';
  const icon = TYPE_ICONS[nodeData.nodeType] ?? '📦';

  return (
    <div style={{ ...nodeStyle, borderColor: color }}>
      {nodeData.nodeType !== 'input' && (
        <Handle type="target" position={Position.Top} style={handleStyle} />
      )}

      <div style={headerStyle}>
        <span style={{ fontSize: 16 }}>{icon}</span>
        <span style={labelStyle}>{nodeData.label}</span>
        <span style={{ ...typeTagStyle, backgroundColor: color }}>
          {nodeData.nodeType}
        </span>
      </div>

      <div style={componentTypeStyle}>{nodeData.componentType}</div>

      <MetricsBadge metrics={nodeData.metrics} nodeType={nodeData.nodeType} />

      {nodeData.nodeType !== 'cache' && nodeData.nodeType !== 'rate_limit' && (
        <Handle type="source" position={Position.Bottom} style={handleStyle} />
      )}
    </div>
  );
}

export default memo(PipelineNodeComponent);

// --- Styles ---

const nodeStyle: CSSProperties = {
  background: '#1e1e2e',
  border: '2px solid',
  borderRadius: 12,
  padding: '12px 16px',
  minWidth: 220,
  maxWidth: 280,
  fontFamily: "'Inter', system-ui, sans-serif",
  color: '#cdd6f4',
  boxShadow: '0 4px 12px rgba(0,0,0,0.3)',
};

const handleStyle: CSSProperties = {
  width: 8,
  height: 8,
  background: '#6b7280',
  border: '2px solid #1e1e2e',
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
  marginBottom: 4,
};

const labelStyle: CSSProperties = {
  fontWeight: 600,
  fontSize: 13,
  flex: 1,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const typeTagStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  padding: '2px 6px',
  borderRadius: 4,
  color: '#fff',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const componentTypeStyle: CSSProperties = {
  fontSize: 11,
  color: '#9399b2',
  marginBottom: 6,
  fontFamily: "'JetBrains Mono', monospace",
};

const badgeContainerStyle: CSSProperties = {
  display: 'flex',
  flexWrap: 'wrap',
  gap: 6,
  marginTop: 4,
};

const badgeStyle: CSSProperties = {
  fontSize: 11,
  color: '#a6adc8',
  fontFamily: "'JetBrains Mono', monospace",
};

const rateBadgeStyle: CSSProperties = {
  fontSize: 11,
  color: '#89b4fa',
  fontFamily: "'JetBrains Mono', monospace",
};
