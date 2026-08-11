import { useQuery } from "@tanstack/react-query";
import { LIST_SHARED_ROADMAP_URL, type RoadmapPillar, type RoadmapTask } from "@/lib/roadmap";

type Result = { pillars: RoadmapPillar[]; tasks: RoadmapTask[]; forbidden: boolean };

async function fetchSharedRoadmap(companyId: string): Promise<Result> {
  const res = await fetch(`${LIST_SHARED_ROADMAP_URL}?company_id=${encodeURIComponent(companyId)}`, {
    credentials: "include",
  });
  if (res.status === 403) return { pillars: [], tasks: [], forbidden: true };
  // Incluye 404: el endpoint todavía puede no existir del lado backend — se
  // degrada a "sin roadmap" en vez de romper, mismo criterio que se usó para
  // evaluate-metrics antes de que backend lo confirmara.
  if (!res.ok) return { pillars: [], tasks: [], forbidden: false };
  const data = await res.json();
  return {
    pillars: Array.isArray(data?.pillars) ? data.pillars : [],
    tasks: Array.isArray(data?.tasks) ? data.tasks : [],
    forbidden: false,
  };
}

/**
 * Lado inversor: roadmap de solo lectura de una empresa conectada, validado
 * server-side — mismo criterio que useSharedDocuments.ts/
 * useSharedFinancialReports.ts. Endpoint asumido (ver LIST_SHARED_ROADMAP_URL
 * en lib/roadmap.ts), todavía no confirmado con backend.
 */
export function useSharedRoadmap(companyId: string | null) {
  const { data, isLoading: loading } = useQuery({
    queryKey: ["shared-roadmap", companyId],
    queryFn: () => fetchSharedRoadmap(companyId!),
    enabled: !!companyId,
  });
  return {
    pillars: data?.pillars ?? [],
    tasks: data?.tasks ?? [],
    loading,
    forbidden: data?.forbidden ?? false,
  };
}
