import { useMemo } from "react";
import { PrivacyToggle } from "@/components/privacy/PrivacyToggle";
import { type MetricDef, type InputsMap, type PeriodInputs } from "@/lib/metrics";
import { evalFormula, evalFormulaDetailed, type CalcDefLike } from "@/lib/formulaEngine";
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
  onInfo,
  privacy,
  onTogglePrivacy,
  readOnly,
}: Props) {
  const inputNameByKey = Object.fromEntries(
    inputDefs.map((d) => [d.input_key!, d.name])
  );

  const resolved = useMemo(
    () =>
      metrics.map((m) => {
        const expr = m.formula_expression!;
        const detailed = evalFormulaDetailed(expr, currentInputs, formulaHistory, calcDefs, rawFieldValues);
        const prev = evalFormula(expr, prevInputs, [], calcDefs, prevRawFieldValues);
        const current = detailed.value;
        const change =
          current != null && prev != null && prev !== 0 ? ((current - prev) / Math.abs(prev)) * 100 : null;
        const sparkData = historyInputs.map((inp) => ({ v: evalFormula(expr, inp, [], calcDefs) ?? 0 }));
        return { metric: m, detailed, change, sparkData };
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [metrics, currentInputs, prevInputs, historyInputs, formulaHistory, calcDefs, rawFieldValues, prevRawFieldValues]
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
            subtitle={m.formula}
            privacyToggle={
              onTogglePrivacy && (
                <PrivacyToggle isPublic={privacy?.[m.id] ?? true} onChange={(next) => onTogglePrivacy(m.id, next)} />
              )
            }
            onInfo={() => onInfo(m)}
            current={detailed.value}
            missing={detailed.missing}
            missingMessage={
              readOnly ? (
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
