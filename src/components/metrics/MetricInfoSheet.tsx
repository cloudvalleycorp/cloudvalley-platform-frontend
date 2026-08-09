import { useMemo } from "react";
import { Pencil, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { formatMetricValue, type MetricDef } from "@/lib/metrics";
import { MONTH_LABELS } from "@/lib/metricPeriod";
import { MetricHistoryChart, type MetricHistoryPoint } from "@/components/metrics/MetricHistoryChart";

export type { MetricHistoryPoint };

type Props = {
  metric: MetricDef | null;
  onClose: () => void;
  history?: MetricHistoryPoint[];
  // Solo lleva a editar (navega al editor de métricas estilo AppSheet, ver
  // Metrics.tsx) — eliminar vive exclusivamente ahí, un solo punto de
  // entrada para una acción destructiva en vez de repetirla en dos sheets.
  onEdit?: (m: MetricDef) => void;
  // Abre el PlatformAgentPanel (ver Metrics.tsx) con esta métrica ya
  // seteada en uiContext.selectedMetricId — reemplaza al viejo "Explicar".
  onOpenAssistant?: () => void;
};

export function MetricInfoSheet({ metric, onClose, history, onEdit, onOpenAssistant }: Props) {
  const sorted = useMemo(
    () =>
      (history ?? [])
        .slice()
        .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year)),
    [history]
  );

  return (
    <Sheet open={!!metric} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{metric?.name}</SheetTitle>
        </SheetHeader>
        {metric && (
          <div className="mt-6 space-y-6">
            <div className="flex items-center justify-between gap-2">
              <div className="inline-flex items-center gap-2 text-xs">
                <span className="px-2 py-0.5 rounded-full bg-surface border border-border text-muted-foreground">
                  {metric.metric_type === "input" ? "Input" : "Calculada"}
                </span>
                {metric.unit && <span className="text-muted-foreground">{metric.unit}</span>}
              </div>
              <div className="flex items-center gap-1">
                {onOpenAssistant && (
                  <Button size="sm" variant="ghost" onClick={onOpenAssistant}>
                    <Sparkles size={12} className="mr-1" aria-hidden="true" /> Asistente
                  </Button>
                )}
                {onEdit && (
                  <Button size="sm" variant="ghost" onClick={() => onEdit(metric)}>
                    <Pencil size={12} className="mr-1" /> Editar
                  </Button>
                )}
              </div>
            </div>

            {sorted.length >= 2 && <MetricHistoryChart key={metric.id} metric={metric} history={history} size="sm" />}

            {sorted.length === 1 && (
              <div className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-3">
                Hay un solo período cargado ({MONTH_LABELS[sorted[0].month - 1]} {sorted[0].year}:{" "}
                {formatMetricValue(sorted[0].value, metric.unit)}). Cargá más meses para ver la evolución.
              </div>
            )}

            {metric.formula && (
              <div>
                <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Fórmula</h4>
                <p className="text-sm font-mono bg-surface p-3 rounded-md">{metric.formula}</p>
              </div>
            )}
            {metric.description && (
              <div>
                <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Qué es</h4>
                <p className="text-sm">{metric.description}</p>
              </div>
            )}
            {metric.why_it_matters && (
              <div>
                <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Por qué importa</h4>
                <p className="text-sm">{metric.why_it_matters}</p>
              </div>
            )}
            {metric.benchmark && (
              <div>
                <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Benchmark</h4>
                <p className="text-sm">{metric.benchmark}</p>
              </div>
            )}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
