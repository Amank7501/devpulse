import { useMutation, useQueryClient } from '@tanstack/react-query';
import { apiClient } from '../lib/apiClient';
import { activityQueryKeys } from './useActivity';

interface SyncStatusResponse {
  status: 'scheduled' | 'cancelled';
}

export function useTriggerSync() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: () =>
      apiClient<SyncStatusResponse>('/api/sync/trigger', {
        method: 'POST',
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: activityQueryKeys.all });
    },
  });
}

export function useCancelSync() {
  return useMutation({
    mutationFn: () =>
      apiClient<SyncStatusResponse>('/api/sync/cancel', {
        method: 'DELETE',
      }),
  });
}
