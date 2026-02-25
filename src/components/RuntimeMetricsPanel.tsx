import { useState, useMemo, type CSSProperties } from 'react';
import Sparkline from './Sparkline';
import type { RuntimeSnapshot } from '../hooks/useRuntimeMetrics';

interface RuntimeMetricsPanelProps {
  snapshots: RuntimeSnapshot[];
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  if (bytes < 1024 * 1024 * 1024) return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  return `${(bytes / (1024 * 1024 * 1024)).toFixed(2)} GB`;
}

function formatDuration(seconds: number): string {
  if (seconds < 0.001) return `${(seconds * 1_000_000).toFixed(0)}µs`;
  if (seconds < 1) return `${(seconds * 1_000).toFixed(1)}ms`;
  return `${seconds.toFixed(2)}s`;
}

function InfoIcon({ tooltip }: { tooltip: string }) {
  const [show, setShow] = useState(false);
  return (
    <span
      style={infoIconWrapperStyle}
      onMouseEnter={() => setShow(true)}
      onMouseLeave={() => setShow(false)}
    >
      <svg width="12" height="12" viewBox="0 0 16 16" fill="none" style={{ display: 'block' }}>
        <circle cx="8" cy="8" r="7" stroke="#585b70" strokeWidth="1.5" fill="none" />
        <text x="8" y="11.5" textAnchor="middle" fontSize="9" fontWeight="700" fill="#585b70">i</text>
      </svg>
      {show && (
        <div style={tooltipStyle}>
          {tooltip}
          <div style={tooltipArrowStyle} />
        </div>
      )}
    </span>
  );
}

function MetricCard({
  title,
  value,
  unit,
  data,
  color,
  info,
}: {
  title: string;
  value: string;
  unit?: string;
  data: number[];
  color: string;
  info: string;
}) {
  return (
    <div style={cardStyle}>
      <div style={cardHeaderStyle}>
        <span style={cardTitleRowStyle}>
          <span style={cardTitleStyle}>{title}</span>
          <InfoIcon tooltip={info} />
        </span>
        <span style={{ ...cardValueStyle, color }}>
          {value}
          {unit && <span style={unitStyle}> {unit}</span>}
        </span>
      </div>
      <Sparkline data={data} width={200} height={36} color={color} fillColor={color} />
    </div>
  );
}

export default function RuntimeMetricsPanel({ snapshots }: RuntimeMetricsPanelProps) {
  const latest = snapshots[snapshots.length - 1];

  const goroutineData = useMemo(() => snapshots.map((s) => s.goroutines), [snapshots]);
  const heapData = useMemo(() => snapshots.map((s) => s.heapBytes), [snapshots]);
  const rssData = useMemo(() => snapshots.map((s) => s.residentMemoryBytes), [snapshots]);
  const stackData = useMemo(() => snapshots.map((s) => s.stackBytes), [snapshots]);

  // Compute CPU % from delta of cpu_seconds_total between consecutive snapshots
  const cpuData = useMemo(() => {
    if (snapshots.length < 2) return [];
    return snapshots.slice(1).map((s, i) => {
      const prev = snapshots[i]!;
      const dtSec = (s.timestamp - prev.timestamp) / 1000;
      if (dtSec <= 0) return 0;
      const cpuDelta = s.cpuSecondsTotal - prev.cpuSecondsTotal;
      return (cpuDelta / dtSec) * 100; // percentage of one core
    });
  }, [snapshots]);

  const gcData = useMemo(() => snapshots.map((s) => s.gcDurationP50 * 1000), [snapshots]);

  if (!latest) return null;

  const currentCpu = cpuData.length > 0 ? cpuData[cpuData.length - 1]! : 0;

  return (
    <div style={panelStyle}>
      <div style={panelHeaderStyle}>
        <h3 style={panelTitleStyle}>⚡ Runtime</h3>
        {latest.goVersion && (
          <span style={goVersionStyle}>{latest.goVersion}</span>
        )}
      </div>

      <div style={gridStyle}>
        <MetricCard
          title="Goroutines"
          value={latest.goroutines.toFixed(0)}
          data={goroutineData}
          color="#89b4fa"
          info="Number of active Go goroutines. A steady increase may indicate a goroutine leak."
        />
        <MetricCard
          title="Heap Alloc"
          value={formatBytes(latest.heapBytes)}
          data={heapData}
          color="#a6e3a1"
          info="Bytes of allocated heap objects. This is the live memory actively used by the Go runtime."
        />
        <MetricCard
          title="RSS Memory"
          value={formatBytes(latest.residentMemoryBytes)}
          data={rssData}
          color="#f9e2af"
          info="Resident Set Size — total physical memory used by the process, as reported by the OS."
        />
        <MetricCard
          title="CPU Usage"
          value={currentCpu.toFixed(1)}
          unit="%"
          data={cpuData}
          color="#fab387"
          info="CPU utilization as a percentage of one core, computed from process_cpu_seconds_total deltas."
        />
        <MetricCard
          title="Stack"
          value={formatBytes(latest.stackBytes)}
          data={stackData}
          color="#cba6f7"
          info="Memory used by goroutine stacks. Grows with the number and depth of active goroutines."
        />
        <MetricCard
          title="GC Pause (p50)"
          value={formatDuration(latest.gcDurationP50)}
          data={gcData}
          color="#f38ba8"
          info="Median (p50) garbage collection stop-the-world pause duration. Lower is better for latency."
        />
      </div>

      <div style={statsRowStyle}>
        <span style={statStyle}>GC runs: <strong>{latest.gcCount}</strong></span>
        <span style={statStyle}>Sys mem: <strong>{formatBytes(latest.sysBytes)}</strong></span>
        <span style={statStyle}>Open FDs: <strong>{latest.openFds}</strong></span>
        <span style={statStyle}>CPU total: <strong>{latest.cpuSecondsTotal.toFixed(1)}s</strong></span>
      </div>
    </div>
  );
}

// --- Styles ---

const panelStyle: CSSProperties = {
  background: '#1e1e2e',
  borderTop: '1px solid #313244',
  padding: '12px 16px',
  flexShrink: 0,
};

const panelHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  marginBottom: 10,
};

const panelTitleStyle: CSSProperties = {
  margin: 0,
  fontSize: 14,
  fontWeight: 700,
  color: '#cdd6f4',
};

const goVersionStyle: CSSProperties = {
  fontSize: 10,
  color: '#9399b2',
  fontFamily: "'JetBrains Mono', monospace",
  background: '#313244',
  padding: '2px 8px',
  borderRadius: 4,
};

const gridStyle: CSSProperties = {
  display: 'grid',
  gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))',
  gap: 10,
  marginBottom: 10,
};

const cardStyle: CSSProperties = {
  background: '#11111b',
  borderRadius: 8,
  padding: '10px 12px',
  border: '1px solid #313244',
};

const cardHeaderStyle: CSSProperties = {
  display: 'flex',
  justifyContent: 'space-between',
  alignItems: 'baseline',
  marginBottom: 6,
};

const cardTitleRowStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 4,
};

const cardTitleStyle: CSSProperties = {
  fontSize: 11,
  fontWeight: 600,
  color: '#6c7086',
  textTransform: 'uppercase',
  letterSpacing: '0.5px',
};

const infoIconWrapperStyle: CSSProperties = {
  position: 'relative',
  cursor: 'help',
  display: 'inline-flex',
  alignItems: 'center',
};

const tooltipStyle: CSSProperties = {
  position: 'absolute',
  bottom: 'calc(100% + 8px)',
  left: '50%',
  transform: 'translateX(-50%)',
  background: '#313244',
  color: '#cdd6f4',
  fontSize: 11,
  lineHeight: '1.4',
  padding: '6px 10px',
  borderRadius: 6,
  whiteSpace: 'normal',
  width: 220,
  zIndex: 50,
  boxShadow: '0 4px 12px rgba(0,0,0,.4)',
  pointerEvents: 'none',
};

const tooltipArrowStyle: CSSProperties = {
  position: 'absolute',
  top: '100%',
  left: '50%',
  transform: 'translateX(-50%)',
  width: 0,
  height: 0,
  borderLeft: '5px solid transparent',
  borderRight: '5px solid transparent',
  borderTop: '5px solid #313244',
};

const cardValueStyle: CSSProperties = {
  fontSize: 14,
  fontWeight: 700,
  fontFamily: "'JetBrains Mono', monospace",
};

const unitStyle: CSSProperties = {
  fontSize: 10,
  fontWeight: 400,
  color: '#6c7086',
};

const statsRowStyle: CSSProperties = {
  display: 'flex',
  gap: 16,
  flexWrap: 'wrap',
};

const statStyle: CSSProperties = {
  fontSize: 11,
  color: '#6c7086',
  fontFamily: "'JetBrains Mono', monospace",
};
