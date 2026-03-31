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

/** Truncate a check condition for edge labels */
function truncateCheck(check: string, maxLen = 40): string {
  if (check.length <= maxLen) return check;
  return check.slice(0, maxLen - 1) + '…';
}

// --- Processor types that contain nested sub-processors ---

const DIRECT_ARRAY_WRAPPERS = new Set(['try', 'catch', 'for_each', 'processors']);
const OBJECT_WRAPPERS = new Set(['while', 'parallel', 'retry', 'branch']);
const BRANCHING_PROCESSORS = new Set(['switch', 'group_by']);

interface ChainResult {
  entryId: string | null;
  exitIds: string[];
}

/**
 * Recursively expand a list of processors into graph nodes and edges.
 * Returns the entry node ID and the set of exit node IDs (for connecting to the next element).
 */
function expandProcessorChain(
  processors: Array<Record<string, unknown>>,
  idPrefix: string,
  metricPrefix: string,
  nodes: PipelineNode[],
  edges: PipelineEdge[],
): ChainResult {
  if (processors.length === 0) return { entryId: null, exitIds: [] };

  let firstNodeId: string | null = null;
  let prevExitIds: string[] = [];

  for (let i = 0; i < processors.length; i++) {
    const proc = processors[i]!;
    const procType = getComponentType(proc);
    const procId = `${idPrefix}-${i}`;
    const procMetric = `${metricPrefix}.${i}`;
    const procLabel = getLabel(proc);
    const componentLabel = typeof proc['label'] === 'string' ? proc['label'] : undefined;

    if (BRANCHING_PROCESSORS.has(procType)) {
      // --- Category A: switch / group_by (branching) ---
      const result = expandBranchingProcessor(
        proc, procType, procId, procMetric, procLabel, componentLabel, nodes, edges,
      );

      if (!firstNodeId) firstNodeId = result.entryId;
      for (const prevId of prevExitIds) {
        if (result.entryId) {
          edges.push({ id: `e-${prevId}-${result.entryId}`, source: prevId, target: result.entryId });
        }
      }
      prevExitIds = result.exitIds;

    } else if (DIRECT_ARRAY_WRAPPERS.has(procType)) {
      // --- Category B1: try, catch, for_each, processors (direct array wrappers) ---
      const childProcessors = proc[procType] as Array<Record<string, unknown>> | undefined;
      const result = expandSequentialWrapper(
        proc, procType, procId, procMetric, procLabel, componentLabel,
        childProcessors ?? [], nodes, edges,
      );

      if (!firstNodeId) firstNodeId = result.entryId;
      for (const prevId of prevExitIds) {
        if (result.entryId) {
          edges.push({ id: `e-${prevId}-${result.entryId}`, source: prevId, target: result.entryId });
        }
      }
      prevExitIds = result.exitIds;

    } else if (OBJECT_WRAPPERS.has(procType)) {
      // --- Category B2: while, parallel, retry, branch (object wrappers with .processors) ---
      const wrapperConfig = proc[procType] as Record<string, unknown> | undefined;
      const childProcessors = (wrapperConfig?.['processors'] as Array<Record<string, unknown>>) ?? [];
      const result = expandSequentialWrapper(
        proc, procType, procId, procMetric, procLabel, componentLabel,
        childProcessors, nodes, edges,
      );

      if (!firstNodeId) firstNodeId = result.entryId;
      for (const prevId of prevExitIds) {
        if (result.entryId) {
          edges.push({ id: `e-${prevId}-${result.entryId}`, source: prevId, target: result.entryId });
        }
      }
      prevExitIds = result.exitIds;

    } else if (procType === 'workflow') {
      // --- Category C: workflow ---
      const result = expandWorkflowProcessor(
        proc, procId, procMetric, procLabel, componentLabel, nodes, edges,
      );

      if (!firstNodeId) firstNodeId = result.entryId;
      for (const prevId of prevExitIds) {
        if (result.entryId) {
          edges.push({ id: `e-${prevId}-${result.entryId}`, source: prevId, target: result.entryId });
        }
      }
      prevExitIds = result.exitIds;

    } else {
      // --- Category D: leaf processor ---
      nodes.push({
        id: procId,
        type: 'processor',
        label: procLabel,
        componentType: procType,
        metricPath: procMetric,
        componentLabel,
        config: proc,
      });

      if (!firstNodeId) firstNodeId = procId;
      for (const prevId of prevExitIds) {
        edges.push({ id: `e-${prevId}-${procId}`, source: prevId, target: procId });
      }
      prevExitIds = [procId];
    }
  }

  return { entryId: firstNodeId, exitIds: prevExitIds };
}

/**
 * Expand a switch or group_by processor into branching subgraph.
 */
function expandBranchingProcessor(
  proc: Record<string, unknown>,
  procType: string,
  procId: string,
  procMetric: string,
  procLabel: string,
  componentLabel: string | undefined,
  nodes: PipelineNode[],
  edges: PipelineEdge[],
): ChainResult {
  const switchNodeId = procId;
  nodes.push({
    id: switchNodeId,
    type: 'processor',
    label: procLabel,
    componentType: procType,
    metricPath: procMetric,
    componentLabel,
    config: proc,
  });

  const cases = proc[procType] as Array<Record<string, unknown>> | undefined;
  if (!cases || !Array.isArray(cases) || cases.length === 0) {
    return { entryId: switchNodeId, exitIds: [switchNodeId] };
  }

  const mergeNodeId = `${procId}-merge`;
  const allCaseExitIds: string[] = [];

  for (let j = 0; j < cases.length; j++) {
    const caseObj = cases[j]!;
    const check = caseObj['check'] as string | undefined;
    const caseProcessors = (caseObj['processors'] as Array<Record<string, unknown>>) ?? [];
    const edgeLabel = check ? truncateCheck(check) : 'default';
    const caseIdPrefix = `${procId}-c${j}`;
    const caseMetricPrefix = `${procMetric}.${procType}.${j}.processors`;

    if (caseProcessors.length === 0) {
      // Empty case: switch connects directly to merge
      allCaseExitIds.push(switchNodeId);
      // Still add a labeled edge from switch to merge (handled below)
      edges.push({
        id: `e-${switchNodeId}-${mergeNodeId}-c${j}`,
        source: switchNodeId,
        target: mergeNodeId,
        label: edgeLabel,
      });
    } else {
      const caseResult = expandProcessorChain(
        caseProcessors, caseIdPrefix, caseMetricPrefix, nodes, edges,
      );

      if (caseResult.entryId) {
        edges.push({
          id: `e-${switchNodeId}-${caseResult.entryId}`,
          source: switchNodeId,
          target: caseResult.entryId,
          label: edgeLabel,
        });
        allCaseExitIds.push(...caseResult.exitIds);
      } else {
        allCaseExitIds.push(switchNodeId);
      }
    }
  }

  nodes.push({
    id: mergeNodeId,
    type: 'merge',
    label: procLabel,
    componentType: 'merge',
    metricPath: procMetric,
    config: {},
  });

  // Connect all case exits to merge (skip if we already added direct switch→merge edges for empty cases)
  for (const exitId of allCaseExitIds) {
    if (exitId === switchNodeId) continue; // already handled above for empty cases
    const edgeId = `e-${exitId}-${mergeNodeId}`;
    if (!edges.some((e) => e.id === edgeId)) {
      edges.push({ id: edgeId, source: exitId, target: mergeNodeId });
    }
  }

  return { entryId: switchNodeId, exitIds: [mergeNodeId] };
}

/**
 * Expand a sequential wrapper (try, catch, for_each, while, parallel, retry, processors, branch).
 * Creates an entry node for the wrapper, then expands children inline.
 */
function expandSequentialWrapper(
  proc: Record<string, unknown>,
  procType: string,
  procId: string,
  procMetric: string,
  procLabel: string,
  componentLabel: string | undefined,
  childProcessors: Array<Record<string, unknown>>,
  nodes: PipelineNode[],
  edges: PipelineEdge[],
): ChainResult {
  // Create the wrapper entry node
  const wrapperNodeId = procId;
  nodes.push({
    id: wrapperNodeId,
    type: 'processor',
    label: procLabel,
    componentType: procType,
    metricPath: procMetric,
    componentLabel,
    config: proc,
  });

  if (childProcessors.length === 0) {
    return { entryId: wrapperNodeId, exitIds: [wrapperNodeId] };
  }

  const childIdPrefix = `${procId}-inner`;
  const childMetricPrefix = `${procMetric}.${procType}.processors`;
  const childResult = expandProcessorChain(
    childProcessors, childIdPrefix, childMetricPrefix, nodes, edges,
  );

  if (childResult.entryId) {
    edges.push({
      id: `e-${wrapperNodeId}-${childResult.entryId}`,
      source: wrapperNodeId,
      target: childResult.entryId,
    });
    return { entryId: wrapperNodeId, exitIds: childResult.exitIds };
  }

  return { entryId: wrapperNodeId, exitIds: [wrapperNodeId] };
}

/**
 * Expand a workflow processor into branching subgraph with named branches.
 */
function expandWorkflowProcessor(
  proc: Record<string, unknown>,
  procId: string,
  procMetric: string,
  procLabel: string,
  componentLabel: string | undefined,
  nodes: PipelineNode[],
  edges: PipelineEdge[],
): ChainResult {
  const workflowNodeId = procId;
  nodes.push({
    id: workflowNodeId,
    type: 'processor',
    label: procLabel,
    componentType: 'workflow',
    metricPath: procMetric,
    componentLabel,
    config: proc,
  });

  const workflowConfig = proc['workflow'] as Record<string, unknown> | undefined;
  const branches = workflowConfig?.['branches'] as Record<string, Record<string, unknown>> | undefined;

  if (!branches || Object.keys(branches).length === 0) {
    return { entryId: workflowNodeId, exitIds: [workflowNodeId] };
  }

  const mergeNodeId = `${procId}-merge`;
  const allBranchExitIds: string[] = [];
  const branchNames = Object.keys(branches);

  for (let j = 0; j < branchNames.length; j++) {
    const branchName = branchNames[j]!;
    const branchConfig = branches[branchName]!;
    const branchProcessors = (branchConfig['processors'] as Array<Record<string, unknown>>) ?? [];
    const branchIdPrefix = `${procId}-br-${branchName}`;
    const branchMetricPrefix = `${procMetric}.workflow.branches.${branchName}.processors`;

    if (branchProcessors.length === 0) {
      allBranchExitIds.push(workflowNodeId);
    } else {
      const branchResult = expandProcessorChain(
        branchProcessors, branchIdPrefix, branchMetricPrefix, nodes, edges,
      );

      if (branchResult.entryId) {
        edges.push({
          id: `e-${workflowNodeId}-${branchResult.entryId}`,
          source: workflowNodeId,
          target: branchResult.entryId,
          label: branchName,
        });
        allBranchExitIds.push(...branchResult.exitIds);
      } else {
        allBranchExitIds.push(workflowNodeId);
      }
    }
  }

  nodes.push({
    id: mergeNodeId,
    type: 'merge',
    label: procLabel,
    componentType: 'merge',
    metricPath: procMetric,
    config: {},
  });

  for (const exitId of allBranchExitIds) {
    if (exitId === workflowNodeId) continue;
    const edgeId = `e-${exitId}-${mergeNodeId}`;
    if (!edges.some((e) => e.id === edgeId)) {
      edges.push({ id: edgeId, source: exitId, target: mergeNodeId });
    }
  }

  return { entryId: workflowNodeId, exitIds: [mergeNodeId] };
}

// --- Sub-output expansion (broker / switch output / fan_out) ---

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

// --- Main entry point ---

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

  // --- Processors (recursive expansion) ---
  const processors = config.pipeline?.processors ?? [];
  const chainResult = expandProcessorChain(
    processors, 'proc', 'root.pipeline.processors', nodes, edges,
  );

  // Connect input to first processor
  if (chainResult.entryId && nodes.find((n) => n.id === 'input')) {
    edges.push({ id: `e-input-${chainResult.entryId}`, source: 'input', target: chainResult.entryId });
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

    // Connect last processor exits (or input) to output
    const exitIds = chainResult.exitIds.length > 0
      ? chainResult.exitIds
      : (nodes.find((n) => n.id === 'input') ? ['input'] : []);

    for (const exitId of exitIds) {
      edges.push({ id: `e-${exitId}-${outputId}`, source: exitId, target: outputId });
    }

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

  connectResources(nodes, edges);

  return { nodes, edges };
}

// --- Resource connection ---

function connectResources(
  nodes: PipelineNode[],
  edges: PipelineEdge[],
): void {
  const cacheNodeByLabel = new Map<string, string>();
  const rateLimitNodeByLabel = new Map<string, string>();
  for (const nd of nodes) {
    if (nd.type === 'cache') cacheNodeByLabel.set(nd.label, nd.id);
    if (nd.type === 'rate_limit') rateLimitNodeByLabel.set(nd.label, nd.id);
  }
  if (cacheNodeByLabel.size === 0 && rateLimitNodeByLabel.size === 0) return;

  for (const nd of nodes) {
    if (nd.type === 'cache' || nd.type === 'rate_limit' || nd.type === 'merge' || !nd.config) continue;

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

function extractResourceRefs(obj: unknown): { caches: Set<string>; rateLimits: Set<string> } {
  const caches = new Set<string>();
  const rateLimits = new Set<string>();

  function walk(value: unknown, key?: string, parentKey?: string): void {
    if (value === null || value === undefined) return;

    if (typeof value === 'string') {
      if (key === 'cache' || key === 'cache_resource') caches.add(value);
      if (key === 'rate_limit' || key === 'rate_limit_resource') rateLimits.add(value);
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
