import {
  MutationCache,
  QueryCache,
  QueryClient,
} from '@tanstack/react-query';
import { ApiError } from './apiClient';

function handleAuthError(error: unknown): void {
  if (!(error instanceof ApiError) || error.status !== 401) {
    return;
  }

  localStorage.clear();

  if (window.location.pathname !== '/login') {
    window.location.assign('/login');
  }
}

export const queryClient = new QueryClient({
  queryCache: new QueryCache({
    onError: handleAuthError,
  }),
  mutationCache: new MutationCache({
    onError: handleAuthError,
  }),
  defaultOptions: {
    queries: {
      staleTime: 60 * 1000,
      retry: (count, error) =>
        count < 2 && !(error instanceof ApiError && error.status === 401),
    },
  },
});
