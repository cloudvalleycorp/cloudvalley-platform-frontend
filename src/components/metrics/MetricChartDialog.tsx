import { useEffect, useMemo, useState } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import {
  CartesianGrid,
  Line,
  LineChart,
  ReferenceLine,
  ResponsiveContainer,
  Tooltip as RTooltip,
  XAxis,
  YAxis,
} from "recharts";
import { formatMetricValue, type MetricDef } from "@/lib/metrics";
import { cn } from "@/lib/utils";

const monthShort = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export type MetricHistoryPoint = { year: number; month: number; value: number };
type Mode = "change" | "absolute";

type Props = {
  metric: MetricDef | null;
  history?: MetricHistoryPoint[];
  onClose: () => void;
};

export function MetricChartDialog({ metric, history, onClose }: Props) {
  const [mode, setMode] = useState<Mode>("change");

  useEffect(() => {
    if (metric) setMode("change");
  }, [metric?.id]);

  const absoluteLabel =
    metric?.unit === "USD"
      ? "$"
      : metric?.unit === "%"
      ? "%"
      : metric?.unit === "x"
      ? "x"
      : metric?.unit === "meses"
      ? "meses"
      : "valor";

  const sorted = useMemo(
    () => (history ?? []).slice().sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year)),
    [history]
  );

  const chartData = useMemo(() => {
    if (mode === "absolute") {
      return sorted.map((p) => ({
        label: `${monthShort[p.month - 1]} ${String(p.year).slice(2)}`,
        value: p.value as number | null,
      }));
    }
    return sorted.map((p, i) => {
      if (i === 0) return { label: `${monthShort[p.month - 1]} ${String(p.year).slice(2)}`, value: null as number | null };
      const prev = sorted[i - 1].value;
      const pct = prev !== 0 ? ((p.value - prev) / Math.abs(prev)) * 100 : null;
      return { label: `${monthShort[p.month - 1]} ${String(p.year).slice(2)}`, value: pct };
    });
  }, [sorted, mode]);

  const validPoints = chartData.filter((d) => d.value !== null && d.value !== undefined).length;
  const formatValue = (v: number) =>
    mode === "absolute" ? formatMetricValue(v, metric?.unit ?? null) : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

  return (
    <Dialog open={!!metric} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="max-w-4xl">
        <DialogHeader>
          <DialogTitle className="flex items-center justify-between gap-4">
            <span className="flex items-center gap-2">
              {metric?.name}
              {metric?.unit && <span className="text-xs text-muted-foreground font-normal">({metric.unit})</span>}
            </span>
            <div className="inline-flex border border-border rounded-md overflow-hidden h-7 mr-6">
              <button
                onClick={() => setMode("change")}
                className={cn(
                  "px-2.5 text-[11px] transition-all",
                  mode === "change" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                )}
              >
                % cambio
              </button>
              <button
                onClick={() => setMode("absolute")}
                className={cn(
                  "px-2.5 text-[11px] transition-all border-l border-border",
                  mode === "absolute" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                )}
              >
                {absoluteLabel}
              </button>
            </div>
          </DialogTitle>
        </DialogHeader>
        {metric && (
          <div className="mt-2">
            {sorted.length < 2 ? (
              <div className="h-96 flex items-center justify-center text-sm text-muted-foreground border border-dashed border-border rounded-md">
                {sorted.length === 0
                  ? "Sin datos cargados todavía."
                  : `Solo hay un período cargado (${monthShort[sorted[0].month - 1]} ${sorted[0].year}). Cargá más meses para ver la evolución.`}
              </div>
            ) : (
              <div className="h-96 border border-border rounded-md p-4 bg-card">
                {validPoints >= 1 ? (
                  <ResponsiveContainer width="100%" height="100%">
                    <LineChart data={chartData} margin={{ top: 8, right: 16, left: 0, bottom: 0 }}>
                      <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                      <XAxis
                        dataKey="label"
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 11, fill: "hsl(var(--muted-foreground))" }}
                        tickLine={false}
                        axisLine={false}
                        width={60}
                        tickFormatter={(v) => formatValue(Number(v))}
                      />
                      {mode === "change" && <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="2 2" />}
                      <RTooltip
                        contentStyle={{
                          background: "hsl(var(--background))",
                          border: "1px solid hsl(var(--border))",
                          borderRadius: 6,
                          fontSize: 12,
                        }}
                        formatter={(v: any) =>
                          v === null || v === undefined
                            ? ["—", metric.name]
                            : [formatValue(Number(v)), mode === "change" ? "% cambio" : metric.name]
                        }
                      />
                      <Line
                        type="monotone"
                        dataKey="value"
                        stroke="hsl(var(--foreground))"
                        strokeWidth={2}
                        dot={{ r: 3, fill: "hsl(var(--foreground))" }}
                        connectNulls
                      />
                    </LineChart>
                  </ResponsiveContainer>
                ) : (
                  <div className="h-full flex items-center justify-center text-xs text-muted-foreground">
                    No hay suficientes datos para calcular el % de cambio.
                  </div>
                )}
              </div>
            )}
            <p className="text-[11px] text-tertiary mt-3">
              {mode === "change"
                ? "Variación porcentual respecto al mes anterior."
                : `Valor absoluto por mes (${absoluteLabel}).`}
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}