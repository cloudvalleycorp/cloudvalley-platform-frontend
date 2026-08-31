import { useQuery } from "@tanstack/react-query";
import {
  EVALUATE_METRICS_URL,
  EVALUATE_METRICS_MAX_IDS,
  type EvaluateMetricsPeriodSpec,
  type EvaluateMetricsResponse,
  type MetricScenario,
} from "@/lib/financialData";

async function fetchEvaluatedMetrics(
  companyId: string,
  metricIds: string[],
  periodSpec: EvaluateMetricsPeriodSpec,
  scenario: MetricScenario
): Promise<EvaluateMetricsResponse> {
  const res = await fetch(EVALUATE_METRICS_URL, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      company_id: companyId,
      metric_ids: metricIds,
      ...periodSpec,
      ...(scenario !== "actual" ? { scenario } : {}),
    }),
  });
  if (!res.ok) {
    return {
      values: {},
      periods: [],
      skipped: metricIds.map((metric_id) => ({ metric_id, reason: "No se pudo calcular (error del servidor)." })),
      metric_metadata: {},
      scenario,
    };
  }
  return (await res.json()) as EvaluateMetricsResponse;
}

/**
 * Valores ya calculados en el backend para métricas `query`-based — ver
 * evaluate-metrics (contrato 2026-08-11). Reemplaza a formulaEngine.ts +
 * query-raw-fields del lado de lectura para estas (esas dos siguen
 * resolviendo las métricas legacy con formula_expression, sin cambios).
 *
 * Costoso del lado del servidor — cada (metric_id × período) puede disparar
 * una agregación real contra Firestore, secuencial. Por eso: 1) el caller
 * solo debe pasar los metric_ids/períodos que la pantalla efectivamente
 * muestra en ese momento, nunca todo el catálogo × todo el histórico, y 2)
 * react-query cachea por (company, metricIds, período) — cambiar de tab o
 * volver a una vista ya cargada no vuelve a pedir lo mismo.
 *
 * metricIds se trunca a EVALUATE_METRICS_MAX_IDS (límite del backend) — en
 * la práctica ninguna pantalla hoy muestra más que eso a la vez.
 */
export function useEvaluatedMetrics(
  companyId: string | null,
  metricIds: string[],
  periodSpec: EvaluateMetricsPeriodSpec | null,
  // Contrato ampliado 2026-08-30: "forecast"/"budget" traen values_actual en
  // la misma respuesta para comparar sin un segundo request — default
  // "actual" preserva el comportamiento de siempre para todos los callers
  // existentes (AnnualGrid, CalculatedMetricsGrid, ReportSectionView).
  scenario: MetricScenario = "actual"
) {
  const ids = metricIds.slice(0, EVALUATE_METRICS_MAX_IDS);
  const idsKey = [...ids].sort().join(",");
  const periodKeyStr = periodSpec ? ("period" in periodSpec ? periodSpec.period : `${periodSpec.period_from}:${periodSpec.period_to}`) : null;

  const { data, isLoading } = useQuery({
    queryKey: ["evaluate-metrics", companyId, idsKey, periodKeyStr, scenario] as const,
    queryFn: () => fetchEvaluatedMetrics(companyId!, ids, periodSpec!, scenario),
    enabled: !!companyId && ids.length > 0 && !!periodSpec,
  });

  return {
    values: data?.values ?? {},
    skipped: data?.skipped ?? [],
    metricMetadata: data?.metric_metadata ?? {},
    valuesActual: data?.values_actual,
    loading: isLoading,
  };
}
