import { useRef } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMetrics } from '../utils/api';
import { parsePrometheusText, groupMetricsByPath } from '../utils/metricsParser';
import type { ComponentMetrics } from '../types';

export interface MetricsResult {
  byPath: Map<string, ComponentMetrics>;
  byLabel: Map<string, ComponentMetrics>;
}

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

export function useBenthosMetrics(targetName: string | null) {
  const prevSnapshot = useRef<Snapshot | null>(null);

  return useQuery<MetricsResult>({
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

      return { byPath, byLabel };
    },
    enabled: !!targetName,
    refetchInterval: 5_000,
    staleTime: 4_000,
  });
}

/** Shallow-clone a metrics map so we keep a stable previous snapshot */
function cloneMetricsMap(m: Map<string, ComponentMetrics>): Map<string, ComponentMetrics> {
  const out = new Map<string, ComponentMetrics>();
  for (const [k, v] of m) {
    out.set(k, { ...v });
  }
  return out;
}
