import { useMemo } from "react";
import { type MetricDef, type InputsMap, type PeriodInputs } from "@/lib/metrics";
import { evalFormula, evalFormulaDetailed, type CalcDefLike } from "@/lib/formulaEngine";
import type { ReportSection } from "@/lib/financialReports";
import { periodRange, prevMonth, toPeriodString } from "@/lib/metricPeriod";
import { useEvaluatedMetrics } from "@/hooks/useEvaluatedMetrics";
import { MetricValueCard } from "@/components/metrics/MetricValueCard";
import { EmptyState } from "@/components/EmptyState";

type Props = {
  section: ReportSection;
  metricById: Record<string, MetricDef>;
  currentInputs: InputsMap;
  prevInputs: InputsMap;
  historyInputs: InputsMap[];
  formulaHistory?: PeriodInputs[];
  // All of the company's calculated metrics (not just this report's blocks)
  // so a formula can reference one that isn't itself in the report.
  calcDefs?: CalcDefLike[];
  // Valores pre-resueltos de FIELDSUM/etc. para el período actual y el
  // anterior — ver useRawFieldValues. El sparkline no los usa (misma
  // limitación conocida que CalculatedMetricsGrid).
  rawFieldValues?: Record<string, number | null>;
  prevRawFieldValues?: Record<string, number | null>;
  // Necesarios para pedir los valores de las métricas query-based del
  // bloque vía evaluate-metrics (ver useEvaluatedMetrics) — las legacy
  // (formula_expression) no lo necesitan.
  companyId: string | null;
  period: { month: number; year: number };
  onInfo: (m: MetricDef) => void;
};

// A report block can be an input or a calculated metric — unlike Growth
// Tracker (which splits them into a list + a grid), a report renders blocks
// as one grid in the exact order the owner arranged them, so both types
// share this one card shape.
export function ReportSectionView({
  section,
  metricById,
  currentInputs,
  prevInputs,
  historyInputs,
  formulaHistory,
  calcDefs,
  rawFieldValues,
  prevRawFieldValues,
  companyId,
  period,
  onInfo,
}: Props) {
  const resolvedBlocks = section.blocks.map((b) => metricById[b.metric_id]).filter((d): d is MetricDef => !!d);

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
    () => resolvedBlocks.filter((d) => d.metric_type === "calculated" && d.query && !d.formula_expression).map((d) => d.id),
    [resolvedBlocks]
  );
  const { values: evaluatedValues, loading: evaluating } = useEvaluatedMetrics(
    companyId,
    queryMetricIds,
    queryMetricIds.length > 0 ? { period_from: evalRange.from, period_to: evalRange.to } : null
  );

  return (
    <div className="space-y-4">
      <div>
        <h3 className="text-sm font-medium">{section.title}</h3>
        {section.subtitle && <p className="text-xs text-muted-foreground mt-0.5">{section.subtitle}</p>}
      </div>
      {resolvedBlocks.length === 0 ? (
        <EmptyState title="Sin métricas en esta sección." bordered={false} className="p-8" />
      ) : (
        <div className="grid md:grid-cols-2 lg:grid-cols-3 gap-4">
          {resolvedBlocks.map((def) => (
            <MetricBlockCard
              key={def.id}
              def={def}
              currentInputs={currentInputs}
              prevInputs={prevInputs}
              historyInputs={historyInputs}
              formulaHistory={formulaHistory}
              calcDefs={calcDefs}
              rawFieldValues={rawFieldValues}
              prevRawFieldValues={prevRawFieldValues}
              evaluatedByPeriod={evaluatedValues[def.id]}
              evaluating={evaluating}
              currentPeriodStr={currentPeriodStr}
              prevPeriodStr={prevPeriodStr}
              historyPeriodStrs={historyPeriodStrs}
              onInfo={onInfo}
            />
          ))}
        </div>
      )}
    </div>
  );
}

function MetricBlockCard({
  def,
  currentInputs,
  prevInputs,
  historyInputs,
  formulaHistory,
  calcDefs = [],
  rawFieldValues = {},
  prevRawFieldValues = {},
  evaluatedByPeriod,
  evaluating,
  currentPeriodStr,
  prevPeriodStr,
  historyPeriodStrs,
  onInfo,
}: {
  def: MetricDef;
  currentInputs: InputsMap;
  prevInputs: InputsMap;
  historyInputs: InputsMap[];
  formulaHistory?: PeriodInputs[];
  calcDefs?: CalcDefLike[];
  rawFieldValues?: Record<string, number | null>;
  prevRawFieldValues?: Record<string, number | null>;
  evaluatedByPeriod?: Record<string, number | null>;
  evaluating: boolean;
  currentPeriodStr: string;
  prevPeriodStr: string;
  historyPeriodStrs: string[];
  onInfo: (m: MetricDef) => void;
}) {
  const expr = def.metric_type === "calculated" ? def.formula_expression : null;
  const isQueryBased = def.metric_type === "calculated" && !!def.query && !def.formula_expression;

  const resolved = useMemo(() => {
    if (isQueryBased) {
      if (!evaluatedByPeriod) {
        return {
          current: null,
          change: null,
          sparkData: historyPeriodStrs.map(() => ({ v: 0 })),
          missing: [evaluating ? "__query_evaluating__" : "__query_no_data__"],
          error: null,
        };
      }
      const current = evaluatedByPeriod[currentPeriodStr] ?? null;
      const prev = evaluatedByPeriod[prevPeriodStr] ?? null;
      const change = current != null && prev != null && prev !== 0 ? ((current - prev) / Math.abs(prev)) * 100 : null;
      const sparkData = historyPeriodStrs.map((p) => ({ v: evaluatedByPeriod[p] ?? 0 }));
      return { current, change, sparkData, missing: current == null ? ["__query_no_data__"] : [], error: null };
    }

    const valueFor = (inputs: InputsMap, history?: PeriodInputs[], raw?: Record<string, number | null>): number | null => {
      if (expr) return evalFormula(expr, inputs, history, calcDefs, raw);
      return def.input_key ? inputs[def.input_key] ?? null : null;
    };

    const currentDetailed = expr ? evalFormulaDetailed(expr, currentInputs, formulaHistory, calcDefs, rawFieldValues) : null;
    const current = expr ? currentDetailed!.value : valueFor(currentInputs);
    const prev = valueFor(prevInputs, undefined, prevRawFieldValues);
    const change = current != null && prev != null && prev !== 0 ? ((current - prev) / Math.abs(prev)) * 100 : null;
    const sparkData = historyInputs.map((inp) => ({ v: valueFor(inp) ?? 0 }));
    const missing = expr
      ? currentDetailed!.missing
      : def.input_key && currentInputs[def.input_key] === undefined
        ? [def.input_key]
        : [];
    const error = currentDetailed?.error ?? null;

    return { current, change, sparkData, missing, error };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    def,
    currentInputs,
    prevInputs,
    historyInputs,
    formulaHistory,
    calcDefs,
    rawFieldValues,
    prevRawFieldValues,
    isQueryBased,
    evaluatedByPeriod,
    evaluating,
    currentPeriodStr,
    prevPeriodStr,
    historyPeriodStrs,
  ]);

  return (
    <MetricValueCard
      name={def.name}
      unit={def.unit}
      onInfo={() => onInfo(def)}
      current={resolved.current}
      missing={resolved.missing}
      missingMessage={
        resolved.missing.includes("__query_evaluating__")
          ? "Calculando…"
          : resolved.missing.includes("__query_no_data__")
            ? "Sin datos suficientes para este período."
            : undefined
      }
      error={resolved.error}
      change={resolved.change}
      sparkData={resolved.sparkData}
    />
  );
}
