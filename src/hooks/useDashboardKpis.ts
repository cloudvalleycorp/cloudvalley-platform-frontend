import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { fetchDashboardKpiIds, saveDashboardKpiIds } from "@/lib/dashboardKpis";

// KPIs del Dashboard por startup. El backend guarda la selección; si nunca se
// configuró (null), se usa el default que calcula el caller a partir del
// catálogo de métricas. Si la lectura falla, también se usa el default: el
// Dashboard sigue útil y el selector muestra el error al guardar.
export function useDashboardKpis(companyId: string | null, defaultIds: string[]) {
  const queryClient = useQueryClient();
  const queryKey = ["dashboard-kpis", companyId] as const;

  const query = useQuery({
    queryKey,
    queryFn: () => fetchDashboardKpiIds(companyId!),
    enabled: !!companyId,
    retry: false,
    refetchOnWindowFocus: false,
  });

  const savedIds = query.data ?? null;
  const kpiIds = savedIds ?? defaultIds;

  const mutation = useMutation({
    mutationFn: (ids: string[]) => saveDashboardKpiIds(companyId!, ids),
    onSuccess: (ids) => {
      queryClient.setQueryData(queryKey, ids);
    },
  });

  return {
    kpiIds,
    loading: query.isLoading,
    saving: mutation.isPending,
    saveKpis: mutation.mutateAsync,
  };
}
