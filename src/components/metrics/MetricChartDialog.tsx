import { useMemo } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { type MetricDef } from "@/lib/metrics";
import { MONTH_LABELS } from "@/lib/metricPeriod";
import { MetricHistoryChart, type MetricHistoryPoint } from "@/components/metrics/MetricHistoryChart";

export type { MetricHistoryPoint };

type Props = {
  metric: MetricDef | null;
  history?: MetricHistoryPoint[];
  onClose: () => void;
};

export function MetricChartDialog({ metric, history, onClose }: Props) {
  const sorted = useMemo(
    () => (history ?? []).slice().sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year)),
    [history]
  );

  return (
    <Dialog open={!!metric} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {metric?.name}
            {metric?.unit && <span className="text-xs text-muted-foreground font-normal">({metric.unit})</span>}
          </DialogTitle>
        </DialogHeader>
        {metric && (
          <div className="mt-2">
            {sorted.length < 2 ? (
              <div className="h-96 flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border rounded-md">
                {sorted.length === 0
                  ? "Sin datos cargados todavía."
                  : `Solo hay un período cargado (${MONTH_LABELS[sorted[0].month - 1]} ${sorted[0].year}). Cargá más meses para ver la evolución.`}
              </div>
            ) : (
              <MetricHistoryChart key={metric.id} metric={metric} history={history} size="lg" />
            )}
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
