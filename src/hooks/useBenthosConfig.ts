import { useQuery } from '@tanstack/react-query';
import { fetchConfig } from '../utils/api';
import { configToGraph } from '../utils/configToGraph';
import type { PipelineGraph } from '../types';

export function useBenthosConfig(targetName: string | null) {
  return useQuery<PipelineGraph>({
    queryKey: ['config', targetName],
    queryFn: async () => {
      if (!targetName) throw new Error('No target selected');
      const yamlStr = await fetchConfig(targetName);
      return configToGraph(yamlStr);
    },
    enabled: !!targetName,
    staleTime: 30_000,
  });
}
