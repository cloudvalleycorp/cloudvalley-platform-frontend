import { useQuery, useQueryClient } from "@tanstack/react-query";
import { LIST_ROADMAP_CATALOG_URL, type ListRoadmapCatalogResponse } from "@/lib/roadmap";

async function fetchRoadmapCatalog(): Promise<ListRoadmapCatalogResponse> {
  const res = await fetch(LIST_ROADMAP_CATALOG_URL, { credentials: "include" });
  if (!res.ok) return { pillars: [], tasks: [] };
  const data = await res.json();
  return {
    pillars: Array.isArray(data?.pillars) ? data.pillars : [],
    tasks: Array.isArray(data?.tasks) ? data.tasks : [],
  };
}

/** Admin-only: catálogo completo (todos los scopes), sin atar a un company_id. */
export function useRoadmapCatalog(enabled: boolean) {
  const queryClient = useQueryClient();
  const queryKey = ["roadmap-catalog"] as const;

  const { data, isLoading: loading } = useQuery({
    queryKey,
    queryFn: fetchRoadmapCatalog,
    enabled,
  });

  const reload = () => queryClient.invalidateQueries({ queryKey });

  return { pillars: data?.pillars ?? [], tasks: data?.tasks ?? [], loading, reload };
}
