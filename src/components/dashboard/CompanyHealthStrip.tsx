import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { ArrowUpRight, ArrowDownRight, Minus, Settings2 } from "lucide-react";
import { SectionNum } from "@/components/dashboard/SectionNum";
import { SectionCard } from "@/components/SectionCard";
import { EmptyState } from "@/components/EmptyState";
import { Button } from "@/components/ui/button";
import { KpiPickerDialog } from "@/components/metrics/KpiPickerDialog";
import { formatMetricValue, percentChange, type MetricDef } from "@/lib/metrics";
import { DASHBOARD_KPI_MAX, defaultDashboardKpiIds, type KpiSaveOutcome } from "@/lib/dashboardKpis";
import { cn } from "@/lib/utils";

// up=true: subir es buena noticia. up=false: subir es mala (burn). Solo aplica
// a métricas estándar, que tienen clave conocida. Las métricas propias no tienen
// dirección: su variación va en gris, sin inventar si es buena o mala.
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
  selectedIds: string[];
  values: Record<string, Record<string, number>>;
  loading: boolean;
  monthLabel: string;
  saving: boolean;
  onChangeSelected: (ids: string[]) => Promise<KpiSaveOutcome>;
};

function KpiTile({ metric, series, monthLabel }: { metric: MetricDef; series: Record<string, number>; monthLabel: string }) {
  const periods = Object.keys(series).sort();
  const current = periods.length > 0 ? series[periods[periods.length - 1]] : null;
  const prev = periods.length > 1 ? series[periods[periods.length - 2]] : null;
  const change = current == null ? null : percentChange(current, prev ?? null);
  const goodUp = metric.standard_key ? (GOOD_DIRECTION_UP[metric.standard_key] ?? true) : null;
  const isGood = change == null || change === 0 || goodUp == null ? null : (change > 0) === goodUp;

  return (
    <div className="border border-border rounded-lg bg-card p-4 min-h-[112px] min-w-0 flex flex-col justify-between">
      <span className="text-xs font-medium text-muted-foreground truncate">{metric.name}</span>
      <div>
        {current == null ? (
          <p className="text-sm text-muted-foreground">
            Sin dato en {monthLabel}.{" "}
            <Link to="/metrics?tab=sources" className="text-primary-dark hover:underline">
              Cargalo en Fuentes
            </Link>{" "}
            para que aparezca.
          </p>
        ) : (
          <div className="text-xl font-medium tabular-nums">{formatMetricValue(current, metric.unit)}</div>
        )}
        {change == null ? (
          current != null && (
            <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
              <Minus size={12} strokeWidth={1.5} aria-hidden="true" /> Sin comparación
            </div>
          )
        ) : change === 0 ? (
          <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
            <Minus size={12} strokeWidth={1.5} aria-hidden="true" /> Sin cambios
          </div>
        ) : (
          <div
            className={cn(
              "text-xs font-medium flex items-center gap-1 mt-0.5",
              isGood === true && "text-success-dark",
              isGood === false && "text-destructive-dark",
              isGood === null && "text-muted-foreground"
            )}
          >
            {change > 0 ? (
              <ArrowUpRight size={12} strokeWidth={1.5} aria-hidden="true" />
            ) : (
              <ArrowDownRight size={12} strokeWidth={1.5} aria-hidden="true" />
            )}
            {Math.abs(change).toFixed(1)}%
          </div>
        )}
      </div>
    </div>
  );
}

export function CompanyHealthStrip({ metrics, selectedIds, values, loading, monthLabel, saving, onChangeSelected }: Props) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const byId = useMemo(() => new Map(metrics.map((m) => [m.id, m])), [metrics]);
  const tiles = selectedIds.map((id) => byId.get(id)).filter((m): m is MetricDef => m !== undefined);
  const defaultIds = useMemo(() => defaultDashboardKpiIds(metrics), [metrics]);

  return (
    <SectionCard
      padding="sm"
      title={
        <span className="flex items-center gap-2">
          <SectionNum n={1} />
          Cómo estamos
        </span>
      }
      action={
        <Button variant="outline" size="sm" onClick={() => setPickerOpen(true)}>
          <Settings2 size={12} className="mr-1.5" aria-hidden="true" />
          KPIs ({tiles.length}/{DASHBOARD_KPI_MAX})
        </Button>
      }
    >
      {loading ? (
        <div aria-live="polite">
          <span className="sr-only">Cargando KPIs…</span>
          <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3" aria-hidden="true">
            {Array.from({ length: 4 }).map((_, i) => (
              <div key={i} className="border border-dashed border-border rounded-lg h-28 animate-pulse bg-surface/50" />
            ))}
          </div>
        </div>
      ) : tiles.length === 0 ? (
        <EmptyState
          bordered={false}
          icon={Settings2}
          title="Todavía no elegiste KPIs para esta startup."
          description="Elegí las métricas que querés ver de un vistazo. Podés usar las estándar o las que creaste."
          action={{ label: "Elegir KPIs", onClick: () => setPickerOpen(true) }}
        />
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {tiles.map((m) => (
            <KpiTile key={m.id} metric={m} series={values[m.id] ?? {}} monthLabel={monthLabel} />
          ))}
        </div>
      )}
      <KpiPickerDialog
        open={pickerOpen}
        onOpenChange={setPickerOpen}
        metrics={metrics}
        selectedIds={selectedIds}
        defaultIds={defaultIds}
        saving={saving}
        onSave={onChangeSelected}
      />
    </SectionCard>
  );
}
