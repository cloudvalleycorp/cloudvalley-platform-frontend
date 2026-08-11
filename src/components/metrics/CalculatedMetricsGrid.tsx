import { useMemo } from "react";
import { PrivacyToggle } from "@/components/privacy/PrivacyToggle";
import { type MetricDef, type InputsMap, type PeriodInputs } from "@/lib/metrics";
import { evalFormula, evalFormulaDetailed, type CalcDefLike } from "@/lib/formulaEngine";
import { summarizeQuery } from "@/lib/querySpec";
import { periodRange, prevMonth, toPeriodString } from "@/lib/metricPeriod";
import { useEvaluatedMetrics } from "@/hooks/useEvaluatedMetrics";
import { MetricValueCard } from "@/components/metrics/MetricValueCard";

type Props = {
  metrics: MetricDef[];
  currentInputs: InputsMap;
  prevInputs: InputsMap;
  historyInputs: InputsMap[]; // last 6 months including current, oldest first — sparkline only
  // Wider window (chronological, ending at current) for SUMLAST/AVGLAST/YTD
  // in the headline value — a longer series than the sparkline needs.
  formulaHistory?: PeriodInputs[];
  inputDefs: MetricDef[]; // to render friendly missing-input names
  // Other calculated metrics a formula can reference by id (metric reuse).
  calcDefs?: CalcDefLike[];
  // Valores pre-resueltos de FIELDSUM/etc. para el período actual (headline)
  // y el anterior (comparación %) — ver useRawFieldValues. El sparkline de
  // 6 meses no los usa (limitación conocida: una fórmula que lee datos
  // crudos hoy se ve como una línea en 0 en el sparkline, el valor grande sí
  // calcula bien).
  rawFieldValues?: Record<string, number | null>;
  prevRawFieldValues?: Record<string, number | null>;
  // company_id + período actual — necesarios para pedir los valores de las
  // métricas query-based vía evaluate-metrics (ver useEvaluatedMetrics). Las
  // legacy (formula_expression) no lo necesitan, se siguen resolviendo con
  // rawFieldValues arriba.
  companyId: string | null;
  period: { month: number; year: number };
  onInfo: (m: MetricDef) => void;
  privacy?: Record<string, boolean>;
  onTogglePrivacy?: (metricId: string, next: boolean) => Promise<void>;
  // Viewer (e.g. a connected fund) who can't load data themselves — "Cargá X
  // para ver esta métrica" doesn't apply to them, the metric is just
  // unavailable (the owner hasn't loaded that public input yet, or the
  // input itself isn't marked public even though the formula is).
  readOnly?: boolean;
};

export function CalculatedMetricsGrid({
  metrics,
  currentInputs,
  prevInputs,
  historyInputs,
  formulaHistory,
  inputDefs,
  calcDefs = [],
  rawFieldValues = {},
  prevRawFieldValues = {},
  companyId,
  period,
  onInfo,
  privacy,
  onTogglePrivacy,
  readOnly,
}: Props) {
  const inputNameByKey = Object.fromEntries(
    inputDefs.map((d) => [d.input_key!, d.name])
  );

  // Marcadores sintéticos (nunca chocan con un input_key real) para el
  // estado de las métricas query-based mientras evaluate-metrics resuelve.
  const QUERY_EVALUATING = "__query_evaluating__";
  const QUERY_NO_DATA = "__query_no_data__";

  // Las 6 fechas de historyInputs (oldest→current) más la anterior, como
  // string "YYYY-MM" — un solo rango contiguo cubre currentInputs,
  // prevInputs y todo el sparkline en un solo request de evaluate-metrics.
  const currentPeriodStr = toPeriodString(period.month, period.year);
  const prevPeriod = prevMonth(period.month, period.year);
  const prevPeriodStr = toPeriodString(prevPeriod.m, prevPeriod.y);
  const historyPeriodStrs = useMemo(() => {
    const out: string[] = [];
    let m = period.month;
    let y = period.year;
    for (let i = 0; i < 6; i++) {
      out.unshift(toPeriodString(m, y));
      const p = prevMonth(m, y);
      m = p.m;
      y = p.y;
    }
    return out;
  }, [period.month, period.year]);
  const evalRange = periodRange(period, 5);

  const queryMetricIds = useMemo(
    () => metrics.filter((m) => m.query && !m.formula_expression).map((m) => m.id),
    [metrics]
  );
  const { values: evaluatedValues, skipped: evaluatedSkipped, loading: evaluating } = useEvaluatedMetrics(
    companyId,
    queryMetricIds,
    queryMetricIds.length > 0 ? { period_from: evalRange.from, period_to: evalRange.to } : null
  );
  const skipReasonByMetricId = useMemo(
    () => Object.fromEntries(evaluatedSkipped.map((s) => [s.metric_id, s.reason])),
    [evaluatedSkipped]
  );

  const resolved = useMemo(
    () =>
      metrics.map((m) => {
        if (m.query && !m.formula_expression) {
          const byPeriod = evaluatedValues[m.id];
          if (!byPeriod) {
            return {
              metric: m,
              detailed: {
                value: null,
                error: null,
                missing: [evaluating ? QUERY_EVALUATING : QUERY_NO_DATA],
                reason: skipReasonByMetricId[m.id],
              },
              change: null,
              sparkData: historyPeriodStrs.map(() => ({ v: 0 })),
            };
          }
          const current = byPeriod[currentPeriodStr] ?? null;
          const prev = byPeriod[prevPeriodStr] ?? null;
          const change = current != null && prev != null && prev !== 0 ? ((current - prev) / Math.abs(prev)) * 100 : null;
          const sparkData = historyPeriodStrs.map((p) => ({ v: byPeriod[p] ?? 0 }));
          return {
            metric: m,
            detailed: { value: current, error: null, missing: current == null ? [QUERY_NO_DATA] : [], reason: undefined },
            change,
            sparkData,
          };
        }
        if (!m.formula_expression) {
          return {
            metric: m,
            detailed: { value: null, error: null, missing: [QUERY_NO_DATA], reason: undefined },
            change: null,
            sparkData: historyInputs.map(() => ({ v: 0 })),
          };
        }
        const expr = m.formula_expression;
        const evalResult = evalFormulaDetailed(expr, currentInputs, formulaHistory, calcDefs, rawFieldValues);
        const detailed = { ...evalResult, reason: undefined as string | undefined };
        const prev = evalFormula(expr, prevInputs, [], calcDefs, prevRawFieldValues);
        const current = detailed.value;
        const change =
          current != null && prev != null && prev !== 0 ? ((current - prev) / Math.abs(prev)) * 100 : null;
        const sparkData = historyInputs.map((inp) => ({ v: evalFormula(expr, inp, [], calcDefs) ?? 0 }));
        return { metric: m, detailed, change, sparkData };
      }),
    [
      metrics,
      currentInputs,
      prevInputs,
      historyInputs,
      formulaHistory,
      calcDefs,
      rawFieldValues,
      prevRawFieldValues,
      evaluatedValues,
      evaluating,
      skipReasonByMetricId,
      historyPeriodStrs,
      currentPeriodStr,
      prevPeriodStr,
    ]
  );

  if (metrics.length === 0) return null;

  return (
    <div>
      <h2 className="text-sm font-medium mb-3">Métricas calculadas</h2>
      <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
        {resolved.map(({ metric: m, detailed, change, sparkData }) => (
          <MetricValueCard
            key={m.id}
            name={m.name}
            unit={m.unit}
            subtitle={m.formula ?? (m.query ? summarizeQuery(m.query) : null)}
            privacyToggle={
              onTogglePrivacy && (
                <PrivacyToggle isPublic={privacy?.[m.id] ?? true} onChange={(next) => onTogglePrivacy(m.id, next)} />
              )
            }
            onInfo={() => onInfo(m)}
            current={detailed.value}
            missing={detailed.missing}
            missingMessage={
              detailed.missing.includes(QUERY_EVALUATING) ? (
                "Calculando…"
              ) : detailed.missing.includes(QUERY_NO_DATA) ? (
                detailed.reason ?? "Sin datos suficientes para este período."
              ) : readOnly ? (
                "Métrica no disponible."
              ) : (
                <>
                  Cargá{" "}
                  <span className="text-foreground font-medium">
                    {detailed.missing.map((k) => inputNameByKey[k] ?? k).join(" y ")}
                  </span>{" "}
                  para ver esta métrica.
                </>
              )
            }
            error={detailed.error}
            change={change}
            sparkData={sparkData}
          />
        ))}
      </div>
    </div>
  );
}
