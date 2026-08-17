import { useQuery } from "@tanstack/react-query";
import { LIST_PORTFOLIO_METRICS_DASHBOARD_URL, type PortfolioMetricsDashboardResponse } from "@/lib/metricRequirements";

type Result = PortfolioMetricsDashboardResponse & { forbidden: boolean; rateLimited: boolean };

const EMPTY: Result = { periods: [], rows: [], portfolio_aggregates: {}, skipped: [], forbidden: false, rateLimited: false };

async function fetchDashboard(period: string, requirementIds?: string[]): Promise<Result> {
  const params = new URLSearchParams({ period });
  if (requirementIds && requirementIds.length > 0) params.set("requirement_ids", requirementIds.join(","));
  const res = await fetch(`${LIST_PORTFOLIO_METRICS_DASHBOARD_URL}?${params.toString()}`, {
    credentials: "include",
  });
  if (res.status === 403) return { ...EMPTY, forbidden: true };
  // 429 es un rate limit propio de este endpoint (el más costoso del set,
  // evalúa startup×requisito×período) — mensaje explícito de "esperá un
  // momento" en vez de reintentar automático o mostrar vacío en silencio.
  if (res.status === 429) return { ...EMPTY, rateLimited: true };
  if (!res.ok) return EMPTY;
  const data = await res.json();
  return {
    periods: Array.isArray(data?.periods) ? data.periods : [],
    rows: Array.isArray(data?.rows) ? data.rows : [],
    portfolio_aggregates: data?.portfolio_aggregates ?? {},
    skipped: Array.isArray(data?.skipped) ? data.skipped : [],
    forbidden: false,
    rateLimited: false,
  };
}

// Reemplaza el patrón N+1 anterior (un useConnectedCompanyMetrics por fila,
// que además no evaluaba métricas query-based) — un único fetch bulk que
// resuelve, para cada startup×requisito, el link vigente y evalúa el query
// propio de esa startup. El fondo nunca aporta lógica de cálculo.
export function usePortfolioMetricsDashboard(period: string, requirementIds?: string[]) {
  const key = [...(requirementIds ?? [])].sort().join(",");
  const { data = EMPTY, isLoading: loading } = useQuery({
    queryKey: ["portfolio-metrics-dashboard", period, key],
    queryFn: () => fetchDashboard(period, requirementIds),
    // 429 no se reintenta automático — la spec pide "sin reintento
    // inmediato", así que no sumamos más presión al rate limit del fondo.
    retry: (failureCount, error) => false,
  });
  return {
    periods: data.periods,
    rows: data.rows,
    portfolioAggregates: data.portfolio_aggregates,
    skipped: data.skipped,
    loading,
    forbidden: data.forbidden,
    rateLimited: data.rateLimited,
  };
}
