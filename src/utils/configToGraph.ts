import yaml from 'js-yaml';
import type { PipelineGraph, PipelineNode, PipelineEdge } from '../types';

interface BenthosConfig {
  input?: Record<string, unknown>;
  pipeline?: {
    processors?: Array<Record<string, unknown>>;
  };
  output?: Record<string, unknown>;
  cache_resources?: Array<Record<string, unknown>>;
  rate_limit_resources?: Array<Record<string, unknown>>;
}

/** Extract the component type name from a Benthos config object (first key that isn't 'label') */
function getComponentType(config: Record<string, unknown>): string {
  for (const key of Object.keys(config)) {
    if (key !== 'label' && key !== 'processors') return key;
  }
  return 'unknown';
}

/** Get a human-readable label for a component */
function getLabel(config: Record<string, unknown>): string {
  if (typeof config['label'] === 'string' && config['label']) {
    return config['label'];
  }
  return getComponentType(config);
}

/**
 * Recursively extract sub-outputs from broker/switch/fan_out etc.
 * These are output types that contain multiple child outputs.
 */
function extractSubOutputs(
  output: Record<string, unknown>,
  parentId: string,
  basePath: string,
  nodes: PipelineNode[],
  edges: PipelineEdge[],
): void {
  const outputType = getComponentType(output);
  const outputConfig = output[outputType];

  // Handle broker pattern: { broker: { outputs: [...] } }
  if (outputType === 'broker' && typeof outputConfig === 'object' && outputConfig !== null) {
    const brokerConfig = outputConfig as Record<string, unknown>;
    const outputs = brokerConfig['outputs'] as Array<Record<string, unknown>> | undefined;
    if (outputs) {
      for (let i = 0; i < outputs.length; i++) {
        const sub = outputs[i]!;
        const subType = getComponentType(sub);
        const subId = `${parentId}-broker-${i}`;
        nodes.push({
          id: subId,
          type: 'output',
          label: getLabel(sub),
          componentType: subType,
          metricPath: `${basePath}.broker.outputs.${i}`,
          componentLabel: typeof sub['label'] === 'string' ? sub['label'] : undefined,
          config: sub,
        });
        edges.push({ id: `e-${parentId}-${subId}`, source: parentId, target: subId });
      }
      return;
    }
  }

  // Handle switch pattern: { switch: { cases: [...] } }
  if (outputType === 'switch' && typeof outputConfig === 'object' && outputConfig !== null) {
    const switchConfig = outputConfig as Record<string, unknown>;
    const cases = switchConfig['cases'] as Array<Record<string, unknown>> | undefined;
    if (cases) {
      for (let i = 0; i < cases.length; i++) {
        const c = cases[i]!;
        const outputDef = c['output'] as Record<string, unknown> | undefined;
        if (outputDef) {
          const subType = getComponentType(outputDef);
          const subId = `${parentId}-switch-${i}`;
          const subLabel = getLabel(outputDef);
          nodes.push({
            id: subId,
            type: 'output',
            label: subLabel,
            componentType: subType,
            metricPath: `${basePath}.switch.cases.${i}.output`,
            componentLabel: typeof outputDef['label'] === 'string' ? outputDef['label'] : undefined,
            config: outputDef,
          });
          edges.push({ id: `e-${parentId}-${subId}`, source: parentId, target: subId });
        }
      }
      return;
    }
  }

  // Handle fan_out pattern: { fan_out: [...] }
  if (outputType === 'fan_out' && Array.isArray(outputConfig)) {
    for (let i = 0; i < outputConfig.length; i++) {
      const sub = outputConfig[i] as Record<string, unknown>;
      const subType = getComponentType(sub);
      const subId = `${parentId}-fanout-${i}`;
      nodes.push({
        id: subId,
        type: 'output',
        label: getLabel(sub),
        componentType: subType,
        metricPath: `${basePath}.fan_out.${i}`,
        componentLabel: typeof sub['label'] === 'string' ? sub['label'] : undefined,
        config: sub,
      });
      edges.push({ id: `e-${parentId}-${subId}`, source: parentId, target: subId });
    }
    return;
  }
}

/**
 * Parse a Benthos YAML config string into a PipelineGraph of nodes and edges.
 */
export function configToGraph(yamlStr: string): PipelineGraph {
  const config = yaml.load(yamlStr) as BenthosConfig;
  const nodes: PipelineNode[] = [];
  const edges: PipelineEdge[] = [];

  // --- Input ---
  if (config.input) {
    const inputType = getComponentType(config.input);
    nodes.push({
      id: 'input',
      type: 'input',
      label: getLabel(config.input),
      componentType: inputType,
      metricPath: 'root.input',
      componentLabel: typeof config.input['label'] === 'string' ? config.input['label'] : undefined,
      config: config.input,
    });
  }

  // --- Processors ---
  const processors = config.pipeline?.processors ?? [];
  for (let i = 0; i < processors.length; i++) {
    const proc = processors[i]!;
    const procType = getComponentType(proc);
    const procId = `processor-${i}`;
    nodes.push({
      id: procId,
      type: 'processor',
      label: getLabel(proc),
      componentType: procType,
      metricPath: `root.pipeline.processors.${i}`,
      componentLabel: typeof proc['label'] === 'string' ? proc['label'] : undefined,
      config: proc,
    });

    // Edge from previous node
    const prevId = i === 0 ? 'input' : `processor-${i - 1}`;
    if (nodes.find(n => n.id === prevId)) {
      edges.push({ id: `e-${prevId}-${procId}`, source: prevId, target: procId });
    }
  }

  // --- Output ---
  if (config.output) {
    const outputType = getComponentType(config.output);
    const outputId = 'output';
    nodes.push({
      id: outputId,
      type: 'output',
      label: getLabel(config.output),
      componentType: outputType,
      metricPath: 'root.output',
      componentLabel: typeof config.output['label'] === 'string' ? config.output['label'] : undefined,
      config: config.output,
    });

    // Edge from last processor (or input if no processors)
    const prevId = processors.length > 0 ? `processor-${processors.length - 1}` : 'input';
    if (nodes.find(n => n.id === prevId)) {
      edges.push({ id: `e-${prevId}-${outputId}`, source: prevId, target: outputId });
    }

    // Expand broker/switch/fan_out sub-outputs
    extractSubOutputs(config.output, outputId, 'root.output', nodes, edges);
  }

  // --- Cache Resources ---
  if (config.cache_resources) {
    for (let i = 0; i < config.cache_resources.length; i++) {
      const cache = config.cache_resources[i]!;
      const cacheLabel = (cache['label'] as string) || getComponentType(cache);
      const cacheType = getComponentType(cache);
      const cacheId = `cache-${i}`;
      nodes.push({
        id: cacheId,
        type: 'cache',
        label: cacheLabel,
        componentType: cacheType,
        metricPath: `root.resource.cache.${cacheLabel}`,
        componentLabel: cacheLabel,
        config: cache,
      });
    }
  }

  // --- Rate Limit Resources ---
  if (config.rate_limit_resources) {
    for (let i = 0; i < config.rate_limit_resources.length; i++) {
      const rl = config.rate_limit_resources[i]!;
      const rlLabel = (rl['label'] as string) || getComponentType(rl);
      const rlType = getComponentType(rl);
      const rlId = `rate-limit-${i}`;
      nodes.push({
        id: rlId,
        type: 'rate_limit',
        label: rlLabel,
        componentType: rlType,
        metricPath: `root.resource.rate_limit.${rlLabel}`,
        componentLabel: rlLabel,
        config: rl,
      });
    }
  }

  // --- Connect cache & rate_limit resources to the nodes that reference them ---
  connectResources(nodes, edges);

  return { nodes, edges };
}

/**
 * Build lookup maps for cache and rate_limit resource nodes by their label,
 * then scan all processor/output node configs to find references and create edges.
 *
 * Cache references appear as e.g. `dedupe: { cache: "mem" }` or `cache: "mem"` at any depth.
 * Rate-limit references appear as e.g. `http_client: { rate_limit: "foo" }`.
 */
function connectResources(
  nodes: PipelineNode[],
  edges: PipelineEdge[],
): void {
  // Build label → nodeId lookup for caches and rate limits
  const cacheNodeByLabel = new Map<string, string>();
  const rateLimitNodeByLabel = new Map<string, string>();
  for (const nd of nodes) {
    if (nd.type === 'cache') cacheNodeByLabel.set(nd.label, nd.id);
    if (nd.type === 'rate_limit') rateLimitNodeByLabel.set(nd.label, nd.id);
  }
  if (cacheNodeByLabel.size === 0 && rateLimitNodeByLabel.size === 0) return;

  // Scan each non-resource node's config for cache / rate_limit references
  for (const nd of nodes) {
    if (nd.type === 'cache' || nd.type === 'rate_limit' || !nd.config) continue;

    const refs = extractResourceRefs(nd.config);

    for (const cacheName of refs.caches) {
      const cacheId = cacheNodeByLabel.get(cacheName);
      if (cacheId) {
        const edgeId = `e-${nd.id}-${cacheId}`;
        if (!edges.some((e) => e.id === edgeId)) {
          edges.push({ id: edgeId, source: nd.id, target: cacheId });
        }
      }
    }

    for (const rlName of refs.rateLimits) {
      const rlId = rateLimitNodeByLabel.get(rlName);
      if (rlId) {
        const edgeId = `e-${nd.id}-${rlId}`;
        if (!edges.some((e) => e.id === edgeId)) {
          edges.push({ id: edgeId, source: nd.id, target: rlId });
        }
      }
    }
  }
}

/**
 * Recursively walk a config object and collect cache / rate_limit string references.
 *
 * Patterns matched:
 *  - `cache: "name"` or `cache_resource: "name"` → cache reference
 *  - `rate_limit: "name"` or `rate_limit_resource: "name"` → rate limit reference (inline field)
 *  - `rate_limit: { resource: "name" }` → rate limit reference (processor form)
 */
function extractResourceRefs(obj: unknown): { caches: Set<string>; rateLimits: Set<string> } {
  const caches = new Set<string>();
  const rateLimits = new Set<string>();

  function walk(value: unknown, key?: string, parentKey?: string): void {
    if (value === null || value === undefined) return;

    if (typeof value === 'string') {
      if (key === 'cache' || key === 'cache_resource') caches.add(value);
      if (key === 'rate_limit' || key === 'rate_limit_resource') rateLimits.add(value);
      // `rate_limit: { resource: "name" }` processor pattern
      if (key === 'resource' && parentKey === 'rate_limit') rateLimits.add(value);
      return;
    }

    if (Array.isArray(value)) {
      for (const item of value) walk(item, undefined, key);
      return;
    }

    if (typeof value === 'object') {
      for (const [k, v] of Object.entries(value as Record<string, unknown>)) {
        walk(v, k, key);
      }
    }
  }

  walk(obj);
  return { caches, rateLimits };
}
