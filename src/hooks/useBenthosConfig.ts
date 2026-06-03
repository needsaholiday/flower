import { useQuery } from '@tanstack/react-query';
import { fetchConfig } from '../utils/api';
import { configToMultiGraph } from '../utils/configToGraph';
import type { MultiPipelineGraph } from '../types';

export function useBenthosConfig(targetName: string | null) {
  return useQuery<MultiPipelineGraph>({
    queryKey: ['config', targetName],
    queryFn: async () => {
      if (!targetName) throw new Error('No target selected');
      const yamlStr = await fetchConfig(targetName);
      return configToMultiGraph(yamlStr);
    },
    enabled: !!targetName,
    staleTime: 30_000,
  });
}
