import { useMemo } from "react";
import { type MetricDef, type InputsMap, type PeriodInputs } from "@/lib/metrics";
import { evalFormula, evalFormulaDetailed, type CalcDefLike } from "@/lib/formulaEngine";
import type { ReportSection } from "@/lib/financialReports";
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
  onInfo,
}: Props) {
  const resolvedBlocks = section.blocks.map((b) => metricById[b.metric_id]).filter((d): d is MetricDef => !!d);

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
  onInfo: (m: MetricDef) => void;
}) {
  const expr = def.metric_type === "calculated" ? def.formula_expression : null;

  const resolved = useMemo(() => {
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
  }, [def, currentInputs, prevInputs, historyInputs, formulaHistory, calcDefs, rawFieldValues, prevRawFieldValues]);

  return (
    <MetricValueCard
      name={def.name}
      unit={def.unit}
      onInfo={() => onInfo(def)}
      current={resolved.current}
      missing={resolved.missing}
      error={resolved.error}
      change={resolved.change}
      sparkData={resolved.sparkData}
    />
  );
}
