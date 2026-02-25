import { useMemo, type CSSProperties } from 'react';

interface SparklineProps {
  data: number[];
  width?: number;
  height?: number;
  color?: string;
  fillColor?: string;
}

export default function Sparkline({
  data,
  width = 180,
  height = 40,
  color = '#89b4fa',
  fillColor,
}: SparklineProps) {
  const path = useMemo(() => {
    if (data.length < 2) return '';

    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;
    const padding = 1;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;

    const points = data.map((v, i) => {
      const x = padding + (i / (data.length - 1)) * chartW;
      const y = padding + chartH - ((v - min) / range) * chartH;
      return `${x},${y}`;
    });

    return `M${points.join(' L')}`;
  }, [data, width, height]);

  const fillPath = useMemo(() => {
    if (!fillColor || data.length < 2) return '';
    const padding = 1;
    const chartW = width - padding * 2;
    const chartH = height - padding * 2;
    const min = Math.min(...data);
    const max = Math.max(...data);
    const range = max - min || 1;

    const points = data.map((v, i) => {
      const x = padding + (i / (data.length - 1)) * chartW;
      const y = padding + chartH - ((v - min) / range) * chartH;
      return `${x},${y}`;
    });

    const lastX = padding + chartW;
    const firstX = padding;
    const bottomY = padding + chartH;

    return `M${points.join(' L')} L${lastX},${bottomY} L${firstX},${bottomY} Z`;
  }, [data, fillColor, width, height]);

  if (data.length < 2) {
    return (
      <div style={{ ...containerStyle, width, height }}>
        <span style={noDataStyle}>waiting…</span>
      </div>
    );
  }

  return (
    <svg width={width} height={height} style={containerStyle}>
      {fillColor && fillPath && (
        <path d={fillPath} fill={fillColor} opacity={0.15} />
      )}
      <path
        d={path}
        fill="none"
        stroke={color}
        strokeWidth={1.5}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

const containerStyle: CSSProperties = {
  display: 'block',
  borderRadius: 4,
  background: '#181825',
};

const noDataStyle: CSSProperties = {
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
  height: '100%',
  fontSize: 10,
  color: '#585b70',
  fontStyle: 'italic',
};
