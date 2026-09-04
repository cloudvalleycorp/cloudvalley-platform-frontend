import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { AlertTriangle, ArrowUpRight, ArrowDownRight, Minus, SlidersHorizontal, Activity } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { SectionCard } from "@/components/SectionCard";
import { STANDARD_KEY_LABELS, STANDARD_KEY_ORDER } from "@/lib/metricRequirements";
import { formatMetricValue, percentChange, type MetricDef } from "@/lib/metrics";
import { loadVisibleKpis, saveVisibleKpis } from "@/lib/visibleKpis";
import { cn } from "@/lib/utils";

// up=true: un aumento de este KPI es una buena noticia (se pinta con
// success-dark); up=false: un aumento es mala noticia (burn), se pinta con
// destructive-dark independientemente del signo del delta. No hay umbrales
// de "sano/crítico" por valor absoluto acá a propósito — inventar un rango
// "bueno" para ARR/burn/runway sin que el founder lo haya definido sería
// fabricar un juicio de negocio que no viene de ningún dato real.
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
  values: Record<string, Record<string, number>>;
  loading: boolean;
  onGoToMetrics: () => void;
};

export function CompanyHealthStrip({ metrics, values, loading, onGoToMetrics }: Props) {
  const [visibleKpis, setVisibleKpis] = useState<Set<string>>(loadVisibleKpis);
  const toggleKpiVisible = (key: string, checked: boolean) => {
    setVisibleKpis((prev) => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      if (next.size === 0) return prev;
      saveVisibleKpis(next);
      return next;
    });
  };
  const visibleOrder = useMemo(() => STANDARD_KEY_ORDER.filter((k) => visibleKpis.has(k)), [visibleKpis]);

  const byKey = useMemo(() => {
    const map = new Map<string, MetricDef[]>();
    for (const m of metrics) {
      if (m.metric_class !== "standard" || !m.standard_key) continue;
      const list = map.get(m.standard_key) ?? [];
      list.push(m);
      map.set(m.standard_key, list);
    }
    return map;
  }, [metrics]);

  return (
    <SectionCard
      padding="sm"
      title={
        <span className="flex items-center gap-1.5">
          <Activity size={14} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
          Cómo estamos
        </span>
      }
      action={
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm">
              <SlidersHorizontal size={12} className="mr-1.5" aria-hidden="true" />
              KPIs ({visibleOrder.length}/{STANDARD_KEY_ORDER.length})
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" className="w-56">
            <DropdownMenuLabel className="text-xs">Elegí qué KPIs mostrar</DropdownMenuLabel>
            <DropdownMenuSeparator />
            {STANDARD_KEY_ORDER.map((key) => (
              <DropdownMenuCheckboxItem
                key={key}
                checked={visibleKpis.has(key)}
                onSelect={(e) => e.preventDefault()}
                onCheckedChange={(checked) => toggleKpiVisible(key, checked === true)}
              >
                {STANDARD_KEY_LABELS[key]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>
      }
    >
      {loading ? (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3" aria-hidden="true">
          {Array.from({ length: 4 }).map((_, i) => (
            <div key={i} className="border border-dashed border-border rounded-lg h-28 animate-pulse bg-surface/50" />
          ))}
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-4 gap-3">
          {visibleOrder.map((key) => {
            const group = byKey.get(key) ?? [];

            if (group.length === 0) {
              return (
                <button
                  key={key}
                  type="button"
                  onClick={onGoToMetrics}
                  className="text-left border border-dashed border-border rounded-lg p-4 min-h-[112px] flex flex-col justify-between hover:border-foreground/30 transition-colors"
                >
                  <span className="text-xs font-medium text-muted-foreground">{STANDARD_KEY_LABELS[key]}</span>
                  <span className="text-xs text-muted-foreground">Sin datos todavía. Conectar fuente →</span>
                </button>
              );
            }

            if (group.length > 1) {
              return (
                <Link
                  key={key}
                  to="/metrics"
                  className="border border-warning/40 bg-warning/5 rounded-lg p-4 min-h-[112px] flex flex-col justify-between hover:border-warning/70 transition-colors"
                >
                  <div className="flex items-center gap-1.5">
                    <AlertTriangle size={12} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
                    <span className="text-xs font-medium">{STANDARD_KEY_LABELS[key]}</span>
                  </div>
                  <span className="text-xs text-muted-foreground">{group.length} métricas en conflicto. Revisar →</span>
                </Link>
              );
            }

            const m = group[0];
            const series = values[m.id] ?? {};
            const periods = Object.keys(series).sort();
            const current = periods.length > 0 ? series[periods[periods.length - 1]] : null;
            const prev = periods.length > 1 ? series[periods[periods.length - 2]] : null;
            const change = percentChange(current ?? null, prev ?? null);
            const goodUp = GOOD_DIRECTION_UP[key] ?? true;
            const isGood = change == null ? null : (change >= 0) === goodUp;

            return (
              <div key={key} className="border border-border rounded-lg bg-card p-4 min-h-[112px] flex flex-col justify-between">
                <span className="text-xs font-medium text-muted-foreground">{STANDARD_KEY_LABELS[key]}</span>
                <div>
                  <div className="text-xl font-medium tabular-nums">{formatMetricValue(current, m.unit)}</div>
                  {change != null ? (
                    <div
                      className={cn(
                        "text-xs font-medium flex items-center gap-1 mt-0.5",
                        isGood ? "text-success-dark" : "text-destructive-dark"
                      )}
                    >
                      {change >= 0 ? (
                        <ArrowUpRight size={12} strokeWidth={1.5} aria-hidden="true" />
                      ) : (
                        <ArrowDownRight size={12} strokeWidth={1.5} aria-hidden="true" />
                      )}
                      {Math.abs(change).toFixed(1)}%
                    </div>
                  ) : (
                    <div className="text-xs text-muted-foreground flex items-center gap-1 mt-0.5">
                      <Minus size={12} strokeWidth={1.5} aria-hidden="true" /> Sin comparación
                    </div>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </SectionCard>
  );
}
