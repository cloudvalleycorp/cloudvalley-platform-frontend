import { Link, useNavigate } from "react-router-dom";
import { Target } from "lucide-react";
import { SectionCard } from "@/components/SectionCard";
import { EmptyState } from "@/components/EmptyState";
import { SkeletonSection } from "@/components/SkeletonSection";
import { STANDARD_KEY_LABELS, STANDARD_KEY_ORDER } from "@/lib/metricRequirements";
import { formatMetricValue, type MetricDef } from "@/lib/metrics";
import { cn } from "@/lib/utils";

// up=true: un forecast mayor al real es la buena dirección para ese KPI
// (más ARR es mejor que lo planeado); false: menos es mejor (burn). Mismo
// criterio/limitación que CompanyHealthStrip.tsx — sin umbrales inventados.
const GOOD_DIRECTION_UP: Record<string, boolean> = {
  arr: true,
  mrr: true,
  revenue: true,
  growth: true,
  gross_margin: true,
  cash: true,
  runway: true,
  burn: false,
};

type Props = {
  metrics: MetricDef[];
  forecastValues: Record<string, Record<string, number>>;
  actualValues: Record<string, Record<string, number>> | undefined;
  loading: boolean;
};

function latest(series: Record<string, number> | undefined): number | null {
  if (!series) return null;
  const periods = Object.keys(series).sort();
  return periods.length > 0 ? series[periods[periods.length - 1]] ?? null : null;
}

// Reusa el forecast ya cargado (scenario "forecast" de evaluate-metrics)
// como proxy del "plan" post-ronda — no existe hoy un concepto de target
// propio del founder distinto del forecast (ver Fase 8 del plan, pedido de
// backend opcional). No hay campo de varianza en backend: se calcula acá.
export function PerformanceVsPlanSection({ metrics, forecastValues, actualValues, loading }: Props) {
  const navigate = useNavigate();
  const byKey = new Map<string, MetricDef>();
  for (const m of metrics) {
    if (m.metric_class === "standard" && m.standard_key) byKey.set(m.standard_key, m);
  }

  const rows = STANDARD_KEY_ORDER.map((key) => {
    const m = byKey.get(key);
    if (!m) return null;
    const target = latest(forecastValues[m.id]);
    const actual = latest(actualValues?.[m.id]);
    if (target == null && actual == null) return null;
    const variance = target != null && actual != null ? actual - target : null;
    const variancePct = variance != null && target !== 0 ? (variance / Math.abs(target!)) * 100 : null;
    const goodUp = GOOD_DIRECTION_UP[key] ?? true;
    const isGood = variance == null ? null : (variance >= 0) === goodUp;
    return { key, m, target, actual, variance, variancePct, isGood };
  }).filter((r): r is NonNullable<typeof r> => r != null);

  return (
    <SectionCard
      padding="sm"
      title={
        <span className="flex items-center gap-1.5">
          <Target size={14} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
          Performance vs Plan
        </span>
      }
      description="Comparado contra el último forecast que cargaste"
    >
      {loading ? (
        <SkeletonSection rows={3} columns={4} />
      ) : rows.length === 0 ? (
        <EmptyState
          bordered={false}
          icon={Target}
          title="Todavía no cargaste un forecast."
          description="Cargá valores de forecast para tus KPIs principales y vas a poder comparar real vs. plan acá."
          action={{ label: "Ir a Métricas", onClick: () => navigate("/metrics?tab=explorer") }}
        />
      ) : (
        <div className="overflow-x-auto -mx-1 px-1">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-[10.5px] font-semibold uppercase tracking-wide text-tertiary">
                <th className="pb-2 pr-4">Métrica</th>
                <th className="pb-2 pr-4">Actual</th>
                <th className="pb-2 pr-4">Target (forecast)</th>
                <th className="pb-2">Variación</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((r) => (
                <tr key={r.key} className="border-t border-border">
                  <td className="py-2.5 pr-4 font-medium">{STANDARD_KEY_LABELS[r.key]}</td>
                  <td className="py-2.5 pr-4 tabular-nums">{formatMetricValue(r.actual, r.m.unit)}</td>
                  <td className="py-2.5 pr-4 tabular-nums text-muted-foreground">{formatMetricValue(r.target, r.m.unit)}</td>
                  <td className="py-2.5 tabular-nums">
                    {r.variance == null ? (
                      <span className="text-muted-foreground">Sin datos para comparar</span>
                    ) : (
                      <span className={cn("font-medium", r.isGood ? "text-success-dark" : "text-destructive-dark")}>
                        {r.variance >= 0 ? "+" : ""}
                        {formatMetricValue(r.variance, r.m.unit)}
                        {r.variancePct != null && ` (${r.variancePct >= 0 ? "+" : ""}${r.variancePct.toFixed(1)}%)`}
                      </span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
