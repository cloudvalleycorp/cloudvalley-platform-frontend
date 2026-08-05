import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { handleMembershipError } from "@/lib/membership";
import { LIST_ROADMAP_URL, TOGGLE_TASK_STATUS_URL, type ListRoadmapResponse, type RoadmapTaskStatus } from "@/lib/roadmap";

async function fetchRoadmap(companyId: string): Promise<ListRoadmapResponse> {
  const res = await fetch(`${LIST_ROADMAP_URL}?company_id=${encodeURIComponent(companyId)}`, {
    credentials: "include",
  });
  if (!res.ok) return { readiness_score: 0, pillars: [], tasks: [] };
  const data = await res.json();
  return {
    readiness_score: data?.readiness_score ?? 0,
    pillars: Array.isArray(data?.pillars) ? data.pillars : [],
    tasks: Array.isArray(data?.tasks) ? data.tasks : [],
  };
}

/** Data layer de Roadmap (founder) — habla con el gateway de Cloud Functions, nunca Supabase. */
export function useRoadmap(companyId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = ["roadmap", companyId] as const;

  const { data, isLoading: loading } = useQuery({
    queryKey,
    queryFn: () => fetchRoadmap(companyId!),
    enabled: !!companyId,
  });

  const reload = () => queryClient.invalidateQueries({ queryKey });

  const toggleStatus = async (startupTaskId: string, next: RoadmapTaskStatus): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(TOGGLE_TASK_STATUS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, startup_task_id: startupTaskId, status: next }),
      });
      if (await handleMembershipError(res)) return false;
      reload();
      return true;
    } catch {
      toast.error("No se pudo actualizar la tarea");
      return false;
    }
  };

  return {
    pillars: data?.pillars ?? [],
    tasks: data?.tasks ?? [],
    readinessScore: data?.readiness_score ?? 0,
    loading,
    toggleStatus,
    reload,
  };
}
