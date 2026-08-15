import { useQuery } from "@tanstack/react-query";
import { LIST_SHARED_ROADMAP_URL, type ListRoadmapResponse, type RoadmapPillar, type RoadmapTask } from "@/lib/roadmap";

type Result = { pillars: RoadmapPillar[]; tasks: RoadmapTask[]; readinessScore: number; forbidden: boolean };

async function fetchSharedRoadmap(companyId: string): Promise<Result> {
  const res = await fetch(`${LIST_SHARED_ROADMAP_URL}?company_id=${encodeURIComponent(companyId)}`, {
    credentials: "include",
  });
  if (res.status === 403) return { pillars: [], tasks: [], readinessScore: 0, forbidden: true };
  // Cualquier otro !ok (incluido un eventual 404 transitorio) degrada a "sin
  // roadmap" en vez de romper la pantalla — el resto de InvestorCompany.tsx
  // sigue funcionando aunque esta sección puntual falle.
  if (!res.ok) return { pillars: [], tasks: [], readinessScore: 0, forbidden: false };
  const data = (await res.json()) as Partial<ListRoadmapResponse>;
  return {
    pillars: Array.isArray(data?.pillars) ? data.pillars : [],
    tasks: Array.isArray(data?.tasks) ? data.tasks : [],
    readinessScore: typeof data?.readiness_score === "number" ? data.readiness_score : 0,
    forbidden: false,
  };
}

/**
 * Lado inversor: roadmap de solo lectura de una empresa conectada, validado
 * server-side — mismo criterio que useSharedDocuments.ts/
 * useSharedFinancialReports.ts.
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
    readinessScore: data?.readinessScore ?? 0,
    loading,
    forbidden: data?.forbidden ?? false,
  };
}
