import { useState, useEffect, type CSSProperties } from 'react';
import type { BenthosTarget } from '../types';
import { checkReady, fetchVersion } from '../utils/api';

interface TargetListProps {
  targets: BenthosTarget[];
  selected: string | null;
  onSelect: (name: string) => void;
}

interface TargetStatus {
  ready: boolean;
  version?: string;
  checking: boolean;
}

export default function TargetList({ targets, selected, onSelect }: TargetListProps) {
  const [statuses, setStatuses] = useState<Record<string, TargetStatus>>({});

  // Check readiness when target is selected
  useEffect(() => {
    if (!selected) return;
    const s = statuses[selected];
    if (s && !s.checking) return;

    setStatuses((prev) => ({
      ...prev,
      [selected]: { ready: false, checking: true },
    }));

    Promise.all([
      checkReady(selected),
      fetchVersion(selected).catch(() => null),
    ]).then(([ready, versionInfo]) => {
      setStatuses((prev) => ({
        ...prev,
        [selected]: {
          ready,
          version: versionInfo?.version,
          checking: false,
        },
      }));
    });
  }, [selected]); // eslint-disable-line react-hooks/exhaustive-deps

  return (
    <div style={containerStyle}>
      <div style={headerStyle}>
        <h2 style={titleStyle}>🔧 Pipelines</h2>
        <span style={countStyle}>{targets.length}</span>
      </div>

      <div style={listStyle}>
        {targets.map((target) => {
          const isSelected = target.name === selected;
          const status = statuses[target.name];
          return (
            <button
              key={target.name}
              style={{
                ...itemStyle,
                ...(isSelected ? itemSelectedStyle : {}),
              }}
              onClick={() => onSelect(target.name)}
            >
              <div style={itemHeaderStyle}>
                <span style={statusDotStyle(status?.ready)}>
                  {status?.checking ? '◌' : status?.ready ? '●' : '○'}
                </span>
                <span style={itemNameStyle}>{target.name}</span>
              </div>
              {target.description && (
                <p style={descStyle}>{target.description}</p>
              )}
              {isSelected && status?.version && (
                <span style={versionStyle}>v{status.version}</span>
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
}

// --- Styles ---

const containerStyle: CSSProperties = {
  width: 280,
  background: '#181825',
  borderRight: '1px solid #313244',
  display: 'flex',
  flexDirection: 'column',
  overflow: 'hidden',
  flexShrink: 0,
};

const headerStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'space-between',
  padding: '16px 16px 12px',
  borderBottom: '1px solid #313244',
};

const titleStyle: CSSProperties = {
  margin: 0,
  fontSize: 16,
  fontWeight: 700,
  color: '#cdd6f4',
};

const countStyle: CSSProperties = {
  fontSize: 12,
  fontWeight: 600,
  color: '#9399b2',
  background: '#313244',
  padding: '2px 8px',
  borderRadius: 10,
};

const listStyle: CSSProperties = {
  flex: 1,
  overflow: 'auto',
  padding: 8,
};

const itemStyle: CSSProperties = {
  width: '100%',
  textAlign: 'left',
  background: 'transparent',
  border: '1px solid transparent',
  borderRadius: 8,
  padding: '10px 12px',
  cursor: 'pointer',
  display: 'block',
  transition: 'all 0.15s',
  marginBottom: 4,
  color: '#cdd6f4',
  fontFamily: 'inherit',
};

const itemSelectedStyle: CSSProperties = {
  background: '#1e1e2e',
  borderColor: '#45475a',
};

const itemHeaderStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  gap: 8,
};

const statusDotStyle = (ready?: boolean): CSSProperties => ({
  fontSize: 10,
  color: ready === true ? '#10b981' : ready === false ? '#6c7086' : '#6c7086',
});

const itemNameStyle: CSSProperties = {
  fontSize: 13,
  fontWeight: 600,
  overflow: 'hidden',
  textOverflow: 'ellipsis',
  whiteSpace: 'nowrap',
};

const descStyle: CSSProperties = {
  margin: '4px 0 0 18px',
  fontSize: 11,
  color: '#6c7086',
  lineHeight: 1.3,
};

const versionStyle: CSSProperties = {
  fontSize: 10,
  color: '#9399b2',
  fontFamily: "'JetBrains Mono', monospace",
  marginLeft: 18,
  marginTop: 4,
  display: 'inline-block',
  background: '#313244',
  padding: '1px 6px',
  borderRadius: 4,
};
