import { useQuery } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';

export interface Me {
  userId: string;
  githubLogin: string;
  avatarUrl: string | null;
}

export function useMe() {
  return useQuery({
    queryKey: ['me'],
    queryFn: () => apiClient<Me>('/api/me'),
    staleTime: Infinity,
  });
}
