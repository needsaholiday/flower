import { useQuery } from '@tanstack/react-query';
import { fetchTargets } from '../utils/api';
import type { BenthosTarget } from '../types';

export function useTargets() {
  return useQuery<BenthosTarget[]>({
    queryKey: ['targets'],
    queryFn: fetchTargets,
    staleTime: 60_000,
  });
}
