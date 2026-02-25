import type { MetricSample, ComponentMetrics } from '../types';

/**
 * Parse Prometheus text exposition format into MetricSample[]
 *
 * Format:
 *   # HELP metric_name description
 *   # TYPE metric_name counter
 *   metric_name{label1="val1",label2="val2"} 123.45
 */
export function parsePrometheusText(text: string): MetricSample[] {
  const samples: MetricSample[] = [];
  const lines = text.split('\n');

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;

    // Match: metric_name{labels} value  OR  metric_name value
    const match = trimmed.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+(-?[\d.eE+-]+(?:NaN|Inf|\+Inf|-Inf)?)$/);
    if (!match) continue;

    const name = match[1]!;
    const labelsStr = match[2] ?? '';
    const value = parseFloat(match[3]!);

    const labels: Record<string, string> = {};
    if (labelsStr) {
      // Parse label="value" pairs
      const labelRegex = /([a-zA-Z_][a-zA-Z0-9_]*)="([^"\\]*)"/g;
      let labelMatch;
      while ((labelMatch = labelRegex.exec(labelsStr)) !== null) {
        labels[labelMatch[1]!] = labelMatch[2]!;
      }
    }

    samples.push({ name, labels, value });
  }

  return samples;
}

/**
 * Group metrics by their `path` label and compute ComponentMetrics for each path.
 * Also builds a secondary index by `label` (Benthos component label) for fallback matching.
 * Benthos adds path labels like "root.input", "root.pipeline.processors.0", "root.output" etc.
 * and label tags like "event_generator", "validate_event", etc.
 */
export function groupMetricsByPath(samples: MetricSample[]): {
  byPath: Map<string, ComponentMetrics>;
  byLabel: Map<string, ComponentMetrics>;
} {
  const byPath = new Map<string, ComponentMetrics>();
  const byLabel = new Map<string, ComponentMetrics>();

  for (const sample of samples) {
    const path = sample.labels['path'];
    const label = sample.labels['label'];

    // Accumulate into both maps
    const targets: Array<{ map: Map<string, ComponentMetrics>; key: string }> = [];
    if (path) targets.push({ map: byPath, key: path });
    if (label) targets.push({ map: byLabel, key: label });

    for (const { map, key } of targets) {
      if (!map.has(key)) {
        map.set(key, {});
      }
      const metrics = map.get(key)!;
      accumulateMetric(metrics, sample);
    }
  }

  return { byPath, byLabel };
}

function accumulateMetric(metrics: ComponentMetrics, sample: MetricSample): void {
  // Map metric names to ComponentMetrics fields
  switch (sample.name) {
    case 'input_received':
      metrics.received = (metrics.received ?? 0) + sample.value;
      break;
    case 'processor_received':
      metrics.received = (metrics.received ?? 0) + sample.value;
      break;
    case 'processor_sent':
    case 'output_sent':
      metrics.sent = (metrics.sent ?? 0) + sample.value;
      break;
    case 'processor_error':
    case 'output_error':
      metrics.error = (metrics.error ?? 0) + sample.value;
      break;
    case 'input_latency_ns':
    case 'processor_latency_ns':
    case 'output_latency_ns':
    case 'cache_latency_ns':
      // Use the latest value (typically a summary quantile)
      if (sample.labels['quantile'] === '0.99' || !sample.labels['quantile']) {
        metrics.latencyNs = sample.value;
      }
      break;
    case 'input_connection_up':
    case 'output_connection_up':
      metrics.connectionUp = sample.value;
      break;
    case 'input_connection_failed':
    case 'output_connection_failed':
      metrics.connectionFailed = (metrics.connectionFailed ?? 0) + sample.value;
      break;
    case 'input_connection_lost':
    case 'output_connection_lost':
      metrics.connectionLost = (metrics.connectionLost ?? 0) + sample.value;
      break;
    case 'processor_batch_sent':
    case 'output_batch_sent':
      metrics.batchSent = (metrics.batchSent ?? 0) + sample.value;
      break;
    case 'processor_batch_received':
      metrics.batchReceived = (metrics.batchReceived ?? 0) + sample.value;
      break;
    case 'cache_not_found':
      metrics.notFound = (metrics.notFound ?? 0) + sample.value;
      break;
    case 'cache_sent':
      metrics.sent = (metrics.sent ?? 0) + sample.value;
      break;
    case 'cache_error':
      metrics.error = (metrics.error ?? 0) + sample.value;
      break;
  }
}

/** Format nanoseconds to human readable */
export function formatLatency(ns: number | undefined): string {
  if (ns === undefined || ns === 0) return '-';
  if (ns < 1_000) return `${ns.toFixed(0)}ns`;
  if (ns < 1_000_000) return `${(ns / 1_000).toFixed(1)}µs`;
  if (ns < 1_000_000_000) return `${(ns / 1_000_000).toFixed(1)}ms`;
  return `${(ns / 1_000_000_000).toFixed(2)}s`;
}

/** Format a count to human readable */
export function formatCount(n: number | undefined): string {
  if (n === undefined) return '-';
  if (n < 1_000) return n.toFixed(0);
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k`;
  return `${(n / 1_000_000).toFixed(1)}M`;
}

/** Format a rate (per second) to human readable */
export function formatRate(n: number | undefined): string {
  if (n === undefined) return '-';
  if (n < 0.01) return '0/s';
  if (n < 1) return `${n.toFixed(2)}/s`;
  if (n < 10) return `${n.toFixed(1)}/s`;
  if (n < 1_000) return `${n.toFixed(0)}/s`;
  if (n < 1_000_000) return `${(n / 1_000).toFixed(1)}k/s`;
  return `${(n / 1_000_000).toFixed(1)}M/s`;
}
