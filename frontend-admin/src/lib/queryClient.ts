import { QueryClient } from '@tanstack/react-query';

/**
 * Shared client cache for server state.
 *
 * Keep this client in one module so route changes reuse the same cache and
 * mutations can invalidate the same query keys from anywhere in the app.
 */
export const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,
      gcTime: 10 * 60_000,
      refetchOnWindowFocus: true,
      refetchOnReconnect: true,
      refetchOnMount: true,
      retry: 1,
    },
  },
});

