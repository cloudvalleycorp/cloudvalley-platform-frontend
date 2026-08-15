import { useMemo } from "react";
import { Link } from "react-router-dom";
import { useConnectedCompanyMetrics } from "@/hooks/useConnectedCompanyMetrics";
import { useMetricReportData } from "@/hooks/useMetricReportData";
import { evalFormula } from "@/lib/formulaEngine";
import { formatMetricValue, type MetricDef } from "@/lib/metrics";
import { periodRange } from "@/lib/metricPeriod";

const now = new Date();
const period = { month: now.getMonth() + 1, year: now.getFullYear() };
const range = periodRange(period, 6);

// metric_id bien conocidos del catálogo default de la plataforma — si una
// empresa lo personalizó, no lo tiene, o no es público, la celda muestra
// "—" (formatMetricValue(null, ...)) en vez de romper. Punto de partida
// simple para comparar el portfolio de un vistazo (decisión del usuario:
// "empecemos con la tabla comparativa"); no intenta adivinar métricas
// custom por nombre.
export const PORTFOLIO_COMPARISON_METRICS: { id: string; label: string }[] = [
  { id: "revenue", label: "Revenue" },
  { id: "new_mrr", label: "Nuevo MRR" },
  { id: "customers", label: "Clientes" },
  { id: "monthly_burn", label: "Burn" },
  { id: "runway", label: "Runway" },
];

function valueFor(def: MetricDef | undefined, currentInputs: Record<string, number>, calcDefs: MetricDef[]) {
  if (!def) return { value: null as number | null, unit: null as string | null };
  if (def.metric_type === "input") {
    return { value: def.input_key ? currentInputs[def.input_key] ?? null : null, unit: def.unit };
  }
  // Query-based (sin formula_expression) no se evalúa acá — mismo criterio
  // que el resto de la app, se necesitaría evaluate-metrics por fila y esto
  // busca ser una vista liviana. Formula legacy sí se evalúa, sin
  // rawFieldValues (una fórmula con FIELDSUM muestra "—" en vez de romper,
  // no se paga el costo de un fetch extra por fila solo para esta tabla).
  if (def.formula_expression) {
    return { value: evalFormula(def.formula_expression, currentInputs, [], calcDefs), unit: def.unit };
  }
  return { value: null, unit: def.unit };
}

type Props = {
  companyId: string;
  companyName: string;
  selected: boolean;
  onToggleSelected: (companyId: string) => void;
};

export function PortfolioMetricsRow({ companyId, companyName, selected, onToggleSelected }: Props) {
  const metrics = useConnectedCompanyMetrics(companyId, range);
  const { currentInputs } = useMetricReportData({ metrics: metrics.metrics, entries: metrics.entries, period });
  const calcDefs = useMemo(() => metrics.metrics.filter((m) => m.metric_type === "calculated"), [metrics.metrics]);
  const metricById = useMemo(() => Object.fromEntries(metrics.metrics.map((m) => [m.id, m])), [metrics.metrics]);

  const nameCell = (
    <td className="px-4 py-3 text-sm font-medium">
      <div className="flex items-center gap-2.5">
        <input
          type="checkbox"
          checked={selected}
          onChange={() => onToggleSelected(companyId)}
          aria-label={`Seleccionar ${companyName} para el asistente`}
          className="h-4 w-4 rounded border-input accent-primary shrink-0"
        />
        <Link to={`/portfolio/${companyId}`} className="hover:underline">
          {companyName}
        </Link>
      </div>
    </td>
  );

  if (metrics.loading) {
    return (
      <tr className="border-t border-border/50">
        {nameCell}
        <td colSpan={PORTFOLIO_COMPARISON_METRICS.length} className="px-4 py-3 text-xs text-muted-foreground">
          Cargando…
        </td>
      </tr>
    );
  }

  if (metrics.forbidden) {
    return (
      <tr className="border-t border-border/50">
        {nameCell}
        <td colSpan={PORTFOLIO_COMPARISON_METRICS.length} className="px-4 py-3 text-xs text-muted-foreground">
          Sin conexión activa.
        </td>
      </tr>
    );
  }

  return (
    <tr className="border-t border-border/50">
      {nameCell}
      {PORTFOLIO_COMPARISON_METRICS.map((m) => {
        const { value, unit } = valueFor(metricById[m.id], currentInputs, calcDefs);
        return (
          <td key={m.id} className="px-4 py-3 text-sm text-right tabular-nums text-muted-foreground">
            {formatMetricValue(value, unit)}
          </td>
        );
      })}
    </tr>
  );
}
