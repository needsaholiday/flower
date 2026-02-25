import type { CSSProperties } from 'react';
import yaml from 'js-yaml';
import type { ComponentMetrics } from '../types';
import type { PipelineNodeData } from './PipelineNode';
import { formatCount, formatLatency, formatRate } from '../utils/metricsParser';

interface MetricsPanelProps {
  nodeData: PipelineNodeData | null;
  metrics?: ComponentMetrics;
  onClose: () => void;
}

function MetricRow({ label, value, color }: { label: string; value: string; color?: string }) {
  return (
    <div style={metricRowStyle}>
      <span style={metricLabelStyle}>{label}</span>
      <span style={{ ...metricValueStyle, color: color ?? '#cdd6f4' }}>{value}</span>
    </div>
  );
}

export default function MetricsPanel({ nodeData, metrics, onClose }: MetricsPanelProps) {
  if (!nodeData) return null;

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <div>
          <h3 style={titleStyle}>{nodeData.label}</h3>
          <span style={subtitleStyle}>{nodeData.componentType} ({nodeData.nodeType})</span>
        </div>
        <button style={closeBtnStyle} onClick={onClose} title="Close">
          ✕
        </button>
      </div>

      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>Metrics</h4>
        {!metrics ? (
          <p style={noDataStyle}>No metrics available for this component</p>
        ) : (
          <div>
            {metrics.received !== undefined && (
              <MetricRow label="Received" value={formatCount(metrics.received)} />
            )}
            {metrics.receivedRate !== undefined && (
              <MetricRow label="Receive Rate" value={formatRate(metrics.receivedRate)} color="#89b4fa" />
            )}
            {metrics.sent !== undefined && (
              <MetricRow label="Sent" value={formatCount(metrics.sent)} />
            )}
            {metrics.sentRate !== undefined && (
              <MetricRow label="Send Rate" value={formatRate(metrics.sentRate)} color="#89b4fa" />
            )}
            {metrics.error !== undefined && (
              <MetricRow
                label="Errors"
                value={formatCount(metrics.error)}
                color={(metrics.error ?? 0) > 0 ? '#ef4444' : undefined}
              />
            )}
            {metrics.errorRate !== undefined && (metrics.errorRate ?? 0) > 0 && (
              <MetricRow
                label="Error Rate"
                value={formatRate(metrics.errorRate)}
                color="#ef4444"
              />
            )}
            {metrics.latencyNs !== undefined && (
              <MetricRow label="Latency (p99)" value={formatLatency(metrics.latencyNs)} />
            )}
            {metrics.connectionUp !== undefined && (
              <MetricRow
                label="Connection"
                value={metrics.connectionUp === 1 ? 'UP' : 'DOWN'}
                color={metrics.connectionUp === 1 ? '#10b981' : '#ef4444'}
              />
            )}
            {metrics.connectionFailed !== undefined && (
              <MetricRow
                label="Conn. Failed"
                value={formatCount(metrics.connectionFailed)}
                color={(metrics.connectionFailed ?? 0) > 0 ? '#ef4444' : undefined}
              />
            )}
            {metrics.connectionLost !== undefined && (
              <MetricRow
                label="Conn. Lost"
                value={formatCount(metrics.connectionLost)}
                color={(metrics.connectionLost ?? 0) > 0 ? '#f59e0b' : undefined}
              />
            )}
            {metrics.batchSent !== undefined && (
              <MetricRow label="Batch Sent" value={formatCount(metrics.batchSent)} />
            )}
            {metrics.batchReceived !== undefined && (
              <MetricRow label="Batch Received" value={formatCount(metrics.batchReceived)} />
            )}
            {metrics.notFound !== undefined && (
              <MetricRow label="Cache Miss" value={formatCount(metrics.notFound)} />
            )}
          </div>
        )}
      </div>

      <div style={sectionStyle}>
        <h4 style={sectionTitleStyle}>Metric Path</h4>
        <code style={codeStyle}>{nodeData.metricPath}</code>
      </div>

      {nodeData.config && (
        <div style={sectionStyle}>
          <h4 style={sectionTitleStyle}>Configuration</h4>
          <pre style={preStyle}>{yaml.dump(nodeData.config, { indent: 2, lineWidth: -1, noRefs: true })}</pre>
        </div>
      )}
    </div>
  );
}

// --- Styles ---

const panelStyle: CSSProperties = {
  width: 340,
  background: '#1e1e2e',
  borderLeft: '1px solid #313244',
  overflow: 'auto',
  padding: 0,
  flexShrink: 0,
};

const panelHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'flex-start',
  padding: '16px 16px 12px',
  borderBottom: '1px solid #313244',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 15,
  fontWeight: 600,
  color: '#cdd6f4',
};

const subtitleStyle: CSSProperties = {
  fontSize: 12,
  color: '#9399b2',
  fontFamily: "'JetBrains Mono', monospace",
};

const closeBtnStyle: CSSProperties = {
  background: 'none',
  border: 'none',
  color: '#6c7086',
  fontSize: 16,
  cursor: 'pointer',
  padding: '2px 6px',
  borderRadius: 4,
};

const sectionStyle: CSSProperties = {
  padding: '12px 16px',
  borderBottom: '1px solid #313244',
};

const sectionTitleStyle: CSSProperties = {
  margin: '0 0 8px',
  fontSize: 11,
  fontWeight: 600,
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
  color: '#6c7086',
};

const metricRowStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  padding: '4px 0',
};

const metricLabelStyle: CSSProperties = {
  fontSize: 13,
  color: '#9399b2',
};

const metricValueStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  fontFamily: "'JetBrains Mono', monospace",
};

const noDataStyle: CSSProperties = {
  fontSize: 12,
  color: '#6c7086',
  fontStyle: 'italic',
};

const codeStyle: CSSProperties = {
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  color: '#f5c2e7',
  background: '#181825',
  padding: '4px 8px',
  borderRadius: 4,
  display: 'block',
  wordBreak: 'break-all',
};

const preStyle: CSSProperties = {
  fontSize: 11,
  fontFamily: "'JetBrains Mono', monospace",
  color: '#cdd6f4',
  background: '#181825',
  padding: 12,
  borderRadius: 6,
  overflow: 'auto',
  maxHeight: 300,
  margin: 0,
  lineHeight: 1.5,
};
