import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        gcTime: 5 * 60_000,
        refetchOnWindowFocus: false,
        retry: 1,
      },
    },
  });

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Prefetch on hover/focus (~50ms intent delay) — makes navigation feel instant.
    defaultPreload: "intent",
    defaultPreloadDelay: 50,
    // Let TanStack Query own cache freshness for prefetched routes.
    defaultPreloadStaleTime: 0,
    // Show pending UI only if the load takes longer than 200ms; keeps fast nav flicker-free.
    defaultPendingMs: 200,
    defaultPendingMinMs: 300,
  });

  return router;
};
