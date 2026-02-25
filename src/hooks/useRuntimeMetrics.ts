import { useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { fetchMetrics } from '../utils/api';
import { parsePrometheusText } from '../utils/metricsParser';

export interface RuntimeSnapshot {
  timestamp: number;
  goroutines: number;
  heapBytes: number;
  heapInuseBytes: number;
  stackBytes: number;
  sysBytes: number;
  cpuSecondsTotal: number;
  gcDurationP50: number;
  gcDurationP99: number;
  gcCount: number;
  residentMemoryBytes: number;
  openFds: number;
  goVersion: string;
}

/** Max number of historical snapshots to keep (at 5s interval = ~8 minutes) */
const MAX_HISTORY = 100;

export function useRuntimeMetrics(targetName: string | null) {
  const historyRef = useRef<RuntimeSnapshot[]>([]);
  const prevTargetRef = useRef<string | null>(null);

  // Reset history when target changes
  if (targetName !== prevTargetRef.current) {
    historyRef.current = [];
    prevTargetRef.current = targetName;
  }

  const buildSnapshot = useCallback((text: string): RuntimeSnapshot[] => {
    const samples = parsePrometheusText(text);
    const snap: RuntimeSnapshot = {
      timestamp: Date.now(),
      goroutines: 0,
      heapBytes: 0,
      heapInuseBytes: 0,
      stackBytes: 0,
      sysBytes: 0,
      cpuSecondsTotal: 0,
      gcDurationP50: 0,
      gcDurationP99: 0,
      gcCount: 0,
      residentMemoryBytes: 0,
      openFds: 0,
      goVersion: '',
    };

    for (const s of samples) {
      switch (s.name) {
        case 'go_goroutines':
          snap.goroutines = s.value;
          break;
        case 'go_memstats_heap_alloc_bytes':
          snap.heapBytes = s.value;
          break;
        case 'go_memstats_heap_inuse_bytes':
          snap.heapInuseBytes = s.value;
          break;
        case 'go_memstats_stack_inuse_bytes':
          snap.stackBytes = s.value;
          break;
        case 'go_memstats_sys_bytes':
          snap.sysBytes = s.value;
          break;
        case 'process_cpu_seconds_total':
          snap.cpuSecondsTotal = s.value;
          break;
        case 'go_gc_duration_seconds':
          if (s.labels['quantile'] === '0.5') snap.gcDurationP50 = s.value;
          if (s.labels['quantile'] === '1') snap.gcDurationP99 = s.value;
          break;
        case 'go_gc_duration_seconds_count':
          snap.gcCount = s.value;
          break;
        case 'process_resident_memory_bytes':
          snap.residentMemoryBytes = s.value;
          break;
        case 'process_open_fds':
          snap.openFds = s.value;
          break;
        case 'go_info':
          snap.goVersion = s.labels['version'] ?? '';
          break;
      }
    }

    const history = historyRef.current;
    history.push(snap);
    if (history.length > MAX_HISTORY) {
      history.splice(0, history.length - MAX_HISTORY);
    }

    return [...history];
  }, []);

  return useQuery<RuntimeSnapshot[]>({
    queryKey: ['runtime-metrics', targetName],
    queryFn: async () => {
      if (!targetName) throw new Error('No target selected');
      const text = await fetchMetrics(targetName);
      return buildSnapshot(text);
    },
    enabled: !!targetName,
    refetchInterval: 5_000,
    staleTime: 4_000,
  });
}
