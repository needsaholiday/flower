import { memo, useMemo, type CSSProperties } from 'react';
import { Handle, Position, type NodeProps } from '@xyflow/react';
import type { ComponentMetrics, MetricsTimePoint } from '../types';
import { formatCount, formatLatency, formatRate } from '../utils/metricsParser';
import Sparkline from './Sparkline';

export interface PipelineNodeData {
  label: string;
  nodeType: 'input' | 'processor' | 'output' | 'cache' | 'rate_limit';
  componentType: string;
  metricPath: string;
  componentLabel?: string;
  metrics?: ComponentMetrics;
  config?: Record<string, unknown>;
  /** Whether this node is currently selected/expanded */
  selected?: boolean;
  /** Historical time-series data for this node */
  metricsHistory?: MetricsTimePoint[];
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

/** Mini chart shown in the expanded node */
function MiniChart({
  title,
  data,
  color,
  currentValue,
}: {
  title: string;
  data: number[];
  color: string;
  currentValue: string;
}) {
  return (
    <div style={miniChartContainerStyle}>
      <div style={miniChartHeaderStyle}>
        <span style={miniChartTitleStyle}>{title}</span>
        <span style={{ ...miniChartValueStyle, color }}>{currentValue}</span>
      </div>
      <Sparkline data={data} width={310} height={44} color={color} fillColor={color} />
    </div>
  );
}

function ExpandedMetrics({
  metrics,
  history,
  nodeType,
}: {
  metrics?: ComponentMetrics;
  history: MetricsTimePoint[];
  nodeType: string;
}) {
  // Extract time-series arrays for each chart
  const rateData = useMemo(() => {
    if (nodeType === 'input') {
      return history.map((p) => p.receivedRate ?? 0);
    }
    return history.map((p) => p.sentRate ?? 0);
  }, [history, nodeType]);

  const inputOutputData = useMemo(() => ({
    received: history.map((p) => p.received ?? 0),
    sent: history.map((p) => p.sent ?? 0),
  }), [history]);

  const latencyData = useMemo(() =>
    history.map((p) => (p.latencyNs ?? 0) / 1_000_000), // convert to ms
  [history]);

  const rateLabel = nodeType === 'input' ? 'Receive Rate' : 'Send Rate';
  const currentRate = nodeType === 'input'
    ? formatRate(metrics?.receivedRate)
    : formatRate(metrics?.sentRate);

  return (
    <div style={expandedContainerStyle}>
      <MiniChart
        title={rateLabel}
        data={rateData}
        color="#89b4fa"
        currentValue={currentRate}
      />
      {nodeType === 'processor' ? (
        <>
          <MiniChart
            title="Received"
            data={inputOutputData.received}
            color="#a6e3a1"
            currentValue={formatCount(metrics?.received)}
          />
          <MiniChart
            title="Sent"
            data={inputOutputData.sent}
            color="#f9e2af"
            currentValue={formatCount(metrics?.sent)}
          />
        </>
      ) : nodeType === 'input' ? (
        <MiniChart
          title="Received"
          data={inputOutputData.received}
          color="#a6e3a1"
          currentValue={formatCount(metrics?.received)}
        />
      ) : (
        <MiniChart
          title="Sent"
          data={inputOutputData.sent}
          color="#f9e2af"
          currentValue={formatCount(metrics?.sent)}
        />
      )}
      <MiniChart
        title="Latency (ms)"
        data={latencyData}
        color="#cba6f7"
        currentValue={formatLatency(metrics?.latencyNs)}
      />
      {(metrics?.error ?? 0) > 0 && (
        <MiniChart
          title="Errors"
          data={history.map((p) => p.error ?? 0)}
          color="#f38ba8"
          currentValue={formatCount(metrics?.error)}
        />
      )}
    </div>
  );
}

function PipelineNodeComponent({ data }: NodeProps) {
  const nodeData = data as unknown as PipelineNodeData;
  const color = TYPE_COLORS[nodeData.nodeType] ?? '#6b7280';
  const icon = TYPE_ICONS[nodeData.nodeType] ?? '📦';
  const isExpanded = !!nodeData.selected;

  return (
    <div style={{
      ...nodeStyle,
      borderColor: color,
      ...(isExpanded ? expandedNodeStyle : {}),
      ...(nodeData.selected ? { boxShadow: `0 0 20px ${color}44, 0 4px 12px rgba(0,0,0,0.3)` } : {}),
    }}>
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

      {isExpanded && (
        <ExpandedMetrics
          metrics={nodeData.metrics}
          history={nodeData.metricsHistory ?? []}
          nodeType={nodeData.nodeType}
        />
      )}

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
  transition: 'all 0.3s ease',
};

const expandedNodeStyle: CSSProperties = {
  minWidth: 350,
  maxWidth: 380,
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

const expandedContainerStyle: CSSProperties = {
  marginTop: 10,
  borderTop: '1px solid #313244',
  paddingTop: 10,
  display: 'flex',
  flexDirection: 'column',
  gap: 8,
};

const miniChartContainerStyle: CSSProperties = {
  background: '#11111b',
  borderRadius: 6,
  padding: '6px 8px',
  border: '1px solid #313244',
};

const miniChartHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 4,
};

const miniChartTitleStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 600,
  color: '#6c7086',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const miniChartValueStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 700,
  fontFamily: "'JetBrains Mono', monospace",
};
