import { useMemo } from "react";
import { Pencil, Sparkles } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import { formatMetricValue, type MetricDef, type RawField } from "@/lib/metrics";
import { MONTH_LABELS } from "@/lib/metricPeriod";
import { MetricHistoryChart, type MetricHistoryPoint } from "@/components/metrics/MetricHistoryChart";
import { QuerySummary } from "@/components/metrics/query-builder/QuerySummary";
import { MetricLineagePanel } from "@/components/metrics/MetricLineagePanel";
import { MetricVersionHistoryPanel } from "@/components/metrics/MetricVersionHistoryPanel";

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
  // Lineage (rediseño AI-native, 2026-08-30) — opcionales para no romper
  // otros usos de este componente que todavía no los pasen; sin ellos
  // simplemente no se muestra la sección "Origen".
  allMetrics?: MetricDef[];
  rawFields?: RawField[];
  companyId?: string | null;
  // Para el desglose por fuente del lineage panel (valor de métricas
  // "input"/carga manual referenciadas dentro de una query multi-fuente) —
  // ver MetricLineagePanel. Opcional, sin cambiar nada si no se pasa.
  entries?: Record<string, Record<string, number>>;
};

export function MetricInfoSheet({ metric, onClose, history, onEdit, onOpenAssistant, allMetrics, rawFields, companyId, entries }: Props) {
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
          <SheetDescription className="sr-only">Detalle de la métrica {metric?.name}</SheetDescription>
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
            {!metric.formula && metric.query && (
              <div>
                <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Definición</h4>
                <div className="bg-surface p-3 rounded-md">
                  <QuerySummary query={metric.query} className="text-sm" />
                </div>
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
            {/* Antes esta métrica se quedaba en "carga a mano" sin ningún
                acceso directo — había que ir a Editar y encontrar la sección
                "Fuente de datos" a ciegas (ver AnnualGrid.tsx/InputsPanel.tsx
                para el mismo acceso desde la grilla). onEdit ya abre
                MetricPropertyPanel con esa sección expandida por default
                para este caso, ver MetricPropertyPanel.tsx. */}
            {metric.metric_type === "input" && !metric.source && onEdit && (
              <div className="border border-dashed border-border rounded-md p-3">
                <p className="text-sm font-medium mb-1">Se carga a mano.</p>
                <p className="text-xs text-muted-foreground mb-2">
                  Si ya conectaste una fuente con este dato, no hace falta seguir cargándolo a mano.
                </p>
                <Button size="sm" variant="outline" onClick={() => onEdit(metric)}>
                  Conectar con una fuente
                </Button>
              </div>
            )}
            {allMetrics && rawFields && (
              <MetricLineagePanel
                metric={metric}
                allMetrics={allMetrics}
                rawFields={rawFields}
                companyId={companyId ?? null}
                entries={entries}
              />
            )}
            {companyId && <MetricVersionHistoryPanel key={metric.id} metric={metric} companyId={companyId} />}
          </div>
        )}
      </SheetContent>
    </Sheet>
  );
}
