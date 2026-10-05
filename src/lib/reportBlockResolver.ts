import { type MetricDef, type InputsMap, type PeriodInputs } from "@/lib/metrics";
import { evalFormula, evalFormulaDetailed, type CalcDefLike } from "@/lib/formulaEngine";
import { prevMonth, toPeriodString } from "@/lib/metricPeriod";

// Resolución de un bloque de reporte (input, calculada por fórmula o
// query-based). Extraída de ReportSectionView para que la vista en pantalla y
// el PDF usen exactamente el mismo cálculo.

export type ReportBlockInputs = {
  def: MetricDef;
  currentInputs: InputsMap;
  prevInputs: InputsMap;
  historyInputs: InputsMap[];
  formulaHistory?: PeriodInputs[];
  calcDefs?: CalcDefLike[];
  rawFieldValues?: Record<string, number | null>;
  prevRawFieldValues?: Record<string, number | null>;
  // Valores de evaluate-metrics por período ("YYYY-MM"), solo para métricas query-based.
  evaluatedByPeriod?: Record<string, number | null>;
  evaluating?: boolean;
  currentPeriodStr: string;
  prevPeriodStr: string;
  historyPeriodStrs: string[];
};

export type ResolvedReportBlock = {
  current: number | null;
  change: number | null;
  // null = sin dato ese mes: el gráfico deja un hueco, nunca un cero inventado.
  sparkData: { v: number | null }[];
  missing: string[];
  error: string | null;
};

export const QUERY_EVALUATING = "__query_evaluating__";
export const QUERY_NO_DATA = "__query_no_data__";

export function isQueryBasedMetric(def: MetricDef): boolean {
  return def.metric_type === "calculated" && !!def.query && !def.formula_expression;
}

// Los 6 períodos del sparkline, del más viejo al actual.
export function buildHistoryPeriodStrs(period: { month: number; year: number }): string[] {
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
}

export function resolveReportBlock(input: ReportBlockInputs): ResolvedReportBlock {
  const { def, currentInputs, prevInputs, historyInputs, formulaHistory, calcDefs = [], rawFieldValues = {}, prevRawFieldValues = {} } = input;
  const { evaluatedByPeriod, evaluating = false, currentPeriodStr, prevPeriodStr, historyPeriodStrs } = input;

  if (isQueryBasedMetric(def)) {
    if (!evaluatedByPeriod) {
      return {
        current: null,
        change: null,
        sparkData: historyPeriodStrs.map(() => ({ v: null })),
        missing: [evaluating ? QUERY_EVALUATING : QUERY_NO_DATA],
        error: null,
      };
    }
    const current = evaluatedByPeriod[currentPeriodStr] ?? null;
    const prev = evaluatedByPeriod[prevPeriodStr] ?? null;
    const change = current != null && prev != null && prev !== 0 ? ((current - prev) / Math.abs(prev)) * 100 : null;
    const sparkData = historyPeriodStrs.map((p) => ({ v: evaluatedByPeriod[p] ?? null }));
    return { current, change, sparkData, missing: current == null ? [QUERY_NO_DATA] : [], error: null };
  }

  const expr = def.metric_type === "calculated" ? def.formula_expression : null;
  const valueFor = (inputs: InputsMap, history?: PeriodInputs[], raw?: Record<string, number | null>): number | null => {
    if (expr) return evalFormula(expr, inputs, history, calcDefs, raw);
    return def.input_key ? inputs[def.input_key] ?? null : null;
  };

  const currentDetailed = expr ? evalFormulaDetailed(expr, currentInputs, formulaHistory, calcDefs, rawFieldValues) : null;
  const current = expr ? currentDetailed!.value : valueFor(currentInputs);
  const prev = valueFor(prevInputs, undefined, prevRawFieldValues);
  const change = current != null && prev != null && prev !== 0 ? ((current - prev) / Math.abs(prev)) * 100 : null;
  const sparkData = historyInputs.map((inp) => ({ v: valueFor(inp) }));
  const missing = expr
    ? currentDetailed!.missing
    : def.input_key && currentInputs[def.input_key] === undefined
      ? [def.input_key]
      : [];
  const error = currentDetailed?.error ?? null;

  return { current, change, sparkData, missing, error };
}
