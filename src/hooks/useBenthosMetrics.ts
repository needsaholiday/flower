import { useQuery } from '@tanstack/react-query';
import { fetchMetrics } from '../utils/api';
import { parsePrometheusText, groupMetricsByPath } from '../utils/metricsParser';
import type { ComponentMetrics } from '../types';

export interface MetricsResult {
  byPath: Map<string, ComponentMetrics>;
  byLabel: Map<string, ComponentMetrics>;
}

export function useBenthosMetrics(targetName: string | null) {
  return useQuery<MetricsResult>({
    queryKey: ['metrics', targetName],
    queryFn: async () => {
      if (!targetName) throw new Error('No target selected');
      const text = await fetchMetrics(targetName);
      const samples = parsePrometheusText(text);
      return groupMetricsByPath(samples);
    },
    enabled: !!targetName,
    refetchInterval: 5_000,
    staleTime: 4_000,
  });
}
