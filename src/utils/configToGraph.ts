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

  return { nodes, edges };
}
