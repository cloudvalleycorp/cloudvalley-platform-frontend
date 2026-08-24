import { useQuery } from "@tanstack/react-query";
import {
  LIST_PORTFOLIO_METRICS_DASHBOARD_URL,
  type PortfolioMetricsDashboardParams,
  type PortfolioMetricsDashboardResponse,
} from "@/lib/metricRequirements";

type Result = PortfolioMetricsDashboardResponse & { forbidden: boolean; rateLimited: boolean };

const EMPTY: Result = { periods: [], rows: [], portfolio_aggregates: {}, skipped: [], forbidden: false, rateLimited: false };

type Options = {
  requirementIds?: string[];
  metricIds?: string[]; // KPIs propios (origin="own_metric"), contrato ampliado 2026-08-23
  segmentId?: string;
};

// Serializa PortfolioMetricsDashboardParams (3 modos mutuamente
// excluyentes) a query string — "range" reemplaza el mes fijo por un rango
// relativo, habilita el modo Trend de Portfolio Compare.
function paramsToQuery(params: PortfolioMetricsDashboardParams): Record<string, string> {
  if ("range" in params) {
    if (params.range === "custom") return { range: "custom", from: params.from, to: params.to };
    return { range: params.range };
  }
  if ("period" in params) return { period: params.period };
  return { period_from: params.period_from, period_to: params.period_to };
}

async function fetchDashboard(params: PortfolioMetricsDashboardParams, opts: Options): Promise<Result> {
  const query = new URLSearchParams(paramsToQuery(params));
  if (opts.requirementIds && opts.requirementIds.length > 0) query.set("requirement_ids", opts.requirementIds.join(","));
  if (opts.metricIds && opts.metricIds.length > 0) query.set("metric_ids", opts.metricIds.join(","));
  if (opts.segmentId) query.set("segment_id", opts.segmentId);
  const res = await fetch(`${LIST_PORTFOLIO_METRICS_DASHBOARD_URL}?${query.toString()}`, {
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
export function usePortfolioMetricsDashboard(params: PortfolioMetricsDashboardParams, opts: Options = {}) {
  const periodKey =
    "range" in params
      ? params.range === "custom"
        ? `custom:${params.from}:${params.to}`
        : params.range
      : "period" in params
        ? params.period
        : `${params.period_from}:${params.period_to}`;
  const reqKey = [...(opts.requirementIds ?? [])].sort().join(",");
  const metricKey = [...(opts.metricIds ?? [])].sort().join(",");
  const { data = EMPTY, isLoading: loading } = useQuery({
    queryKey: ["portfolio-metrics-dashboard", periodKey, reqKey, metricKey, opts.segmentId ?? ""],
    queryFn: () => fetchDashboard(params, opts),
    // 429 no se reintenta automático — la spec pide "sin reintento
    // inmediato", así que no sumamos más presión al rate limit del fondo.
    retry: () => false,
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
