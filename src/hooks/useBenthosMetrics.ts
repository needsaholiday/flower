import { useRef, useState, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMetrics } from '../utils/api';
import { parsePrometheusText, groupMetricsByPath } from '../utils/metricsParser';
import type { ComponentMetrics, MetricsTimePoint } from '../types';

export interface MetricsResult {
  byPath: Map<string, ComponentMetrics>;
  byLabel: Map<string, ComponentMetrics>;
}

/** Rolling time-series history per component key */
export interface MetricsHistory {
  byPath: Map<string, MetricsTimePoint[]>;
  byLabel: Map<string, MetricsTimePoint[]>;
}

/** Maximum number of historical data points to keep per component */
const MAX_HISTORY_POINTS = 120;

interface Snapshot {
  time: number;
  byPath: Map<string, ComponentMetrics>;
  byLabel: Map<string, ComponentMetrics>;
}

/** Compute per-second rates by comparing two snapshots */
function attachRates(
  current: Map<string, ComponentMetrics>,
  prev: Map<string, ComponentMetrics>,
  dtSec: number,
): void {
  for (const [key, cur] of current) {
    const old = prev.get(key);
    if (!old || dtSec <= 0) continue;

    if (cur.received !== undefined && old.received !== undefined) {
      const delta = cur.received - old.received;
      cur.receivedRate = delta >= 0 ? delta / dtSec : undefined;
    }
    if (cur.sent !== undefined && old.sent !== undefined) {
      const delta = cur.sent - old.sent;
      cur.sentRate = delta >= 0 ? delta / dtSec : undefined;
    }
    if (cur.error !== undefined && old.error !== undefined) {
      const delta = cur.error - old.error;
      cur.errorRate = delta >= 0 ? delta / dtSec : undefined;
    }
  }
}

/** Append current metrics to the rolling history maps */
function appendHistory(
  history: MetricsHistory,
  metricsMap: Map<string, ComponentMetrics>,
  target: 'byPath' | 'byLabel',
  timestamp: number,
): void {
  const histMap = history[target];
  for (const [key, m] of metricsMap) {
    if (!histMap.has(key)) {
      histMap.set(key, []);
    }
    const arr = histMap.get(key)!;
    arr.push({
      timestamp,
      received: m.received,
      sent: m.sent,
      error: m.error,
      latencyNs: m.latencyNs,
      receivedRate: m.receivedRate,
      sentRate: m.sentRate,
      errorRate: m.errorRate,
    });
    // Trim to max points
    if (arr.length > MAX_HISTORY_POINTS) {
      arr.splice(0, arr.length - MAX_HISTORY_POINTS);
    }
  }
}

export function useBenthosMetrics(targetName: string | null) {
  const prevSnapshot = useRef<Snapshot | null>(null);
  const historyRef = useRef<MetricsHistory>({
    byPath: new Map(),
    byLabel: new Map(),
  });
  const [history, setHistory] = useState<MetricsHistory>({
    byPath: new Map(),
    byLabel: new Map(),
  });

  const resetHistory = useCallback(() => {
    historyRef.current = { byPath: new Map(), byLabel: new Map() };
    setHistory({ byPath: new Map(), byLabel: new Map() });
    prevSnapshot.current = null;
  }, []);

  const query = useQuery<MetricsResult>({
    queryKey: ['metrics', targetName],
    queryFn: async () => {
      if (!targetName) throw new Error('No target selected');
      const text = await fetchMetrics(targetName);
      const samples = parsePrometheusText(text);
      const { byPath, byLabel } = groupMetricsByPath(samples);

      const now = Date.now();
      const prev = prevSnapshot.current;

      if (prev && prev.time > 0) {
        const dtSec = (now - prev.time) / 1000;
        attachRates(byPath, prev.byPath, dtSec);
        attachRates(byLabel, prev.byLabel, dtSec);
      }

      prevSnapshot.current = { time: now, byPath: cloneMetricsMap(byPath), byLabel: cloneMetricsMap(byLabel) };

      // Append to history
      const hist = historyRef.current;
      appendHistory(hist, byPath, 'byPath', now);
      appendHistory(hist, byLabel, 'byLabel', now);
      // Trigger a re-render with cloned Maps+arrays so downstream memo/React detects changes
      setHistory({
        byPath: cloneHistoryMap(hist.byPath),
        byLabel: cloneHistoryMap(hist.byLabel),
      });

      return { byPath, byLabel };
    },
    enabled: !!targetName,
    refetchInterval: 5_000,
    staleTime: 4_000,
  });

  return { ...query, history, resetHistory };
}

/** Clone a history map producing new Map + new arrays so React detects the change */
function cloneHistoryMap(m: Map<string, MetricsTimePoint[]>): Map<string, MetricsTimePoint[]> {
  const out = new Map<string, MetricsTimePoint[]>();
  for (const [k, v] of m) {
    out.set(k, [...v]);
  }
  return out;
}

/** Shallow-clone a metrics map so we keep a stable previous snapshot */
function cloneMetricsMap(m: Map<string, ComponentMetrics>): Map<string, ComponentMetrics> {
  const out = new Map<string, ComponentMetrics>();
  for (const [k, v] of m) {
    out.set(k, { ...v });
  }
  return out;
}
