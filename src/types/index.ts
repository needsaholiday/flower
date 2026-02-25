/** A configured Benthos target from targets.json */
export interface BenthosTarget {
  name: string;
  url: string;
  description?: string;
}

/** Parsed Prometheus metric sample */
export interface MetricSample {
  name: string;
  labels: Record<string, string>;
  value: number;
}

/** Aggregated metrics for a pipeline component */
export interface ComponentMetrics {
  received?: number;
  sent?: number;
  error?: number;
  latencyNs?: number;
  connectionUp?: number;
  connectionFailed?: number;
  connectionLost?: number;
  batchSent?: number;
  batchReceived?: number;
  notFound?: number;
}

/** A node in the pipeline DAG */
export interface PipelineNode {
  id: string;
  type: 'input' | 'processor' | 'output' | 'cache' | 'rate_limit';
  label: string;
  componentType: string;
  metricPath: string;
  /** The Benthos label (used as Prometheus 'label' tag for metric matching) */
  componentLabel?: string;
  config?: Record<string, unknown>;
}

/** An edge in the pipeline DAG */
export interface PipelineEdge {
  id: string;
  source: string;
  target: string;
}

/** Parsed pipeline graph */
export interface PipelineGraph {
  nodes: PipelineNode[];
  edges: PipelineEdge[];
}
