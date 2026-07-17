import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { LineChart, Line, ResponsiveContainer, XAxis, YAxis, Tooltip as RTooltip, CartesianGrid, ReferenceLine } from "recharts";
import { formatMetricValue, type MetricDef } from "@/lib/metrics";
import { cn } from "@/lib/utils";

const monthShort = ["Ene", "Feb", "Mar", "Abr", "May", "Jun", "Jul", "Ago", "Sep", "Oct", "Nov", "Dic"];

export type MetricHistoryPoint = {
  year: number;
  month: number;
  value: number;
};

type Props = {
  metric: MetricDef | null;
  onClose: () => void;
  history?: MetricHistoryPoint[];
};

type Mode = "change" | "absolute";

export function MetricInfoSheet({ metric, onClose, history }: Props) {
  const [mode, setMode] = useState<Mode>("change");

  // Reset to default when opening a different metric
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
    () =>
      (history ?? [])
        .slice()
        .sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year)),
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
      if (i === 0) {
        return {
          label: `${monthShort[p.month - 1]} ${String(p.year).slice(2)}`,
          value: null as number | null,
        };
      }
      const prev = sorted[i - 1].value;
      const pct = prev !== 0 ? ((p.value - prev) / Math.abs(prev)) * 100 : null;
      return {
        label: `${monthShort[p.month - 1]} ${String(p.year).slice(2)}`,
        value: pct,
      };
    });
  }, [sorted, mode]);

  const validPoints = chartData.filter((d) => d.value !== null && d.value !== undefined).length;
  const formatValue = (v: number) =>
    mode === "absolute"
      ? formatMetricValue(v, metric?.unit ?? null)
      : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

  return (
    <Sheet open={!!metric} onOpenChange={(o) => !o && onClose()}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader>
          <SheetTitle>{metric?.name}</SheetTitle>
        </SheetHeader>
        {metric && (
          <div className="mt-6 space-y-6">
            <div className="inline-flex items-center gap-2 text-xs">
              <span className="px-2 py-0.5 rounded-full bg-surface border border-border text-muted-foreground">
                {metric.metric_type === "input" ? "Input" : "Calculada"}
              </span>
              {metric.unit && <span className="text-muted-foreground">{metric.unit}</span>}
            </div>

            {sorted.length >= 2 && (
              <div>
                <div className="flex items-center justify-between mb-2">
                  <h4 className="text-xs uppercase tracking-wide text-muted-foreground">
                    Evolución
                  </h4>
                  <div className="inline-flex border border-border rounded-md overflow-hidden h-7">
                    <button
                      onClick={() => setMode("change")}
                      className={cn(
                        "px-2.5 text-[11px] transition-all",
                        mode === "change"
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      % cambio
                    </button>
                    <button
                      onClick={() => setMode("absolute")}
                      className={cn(
                        "px-2.5 text-[11px] transition-all border-l border-border",
                        mode === "absolute"
                          ? "bg-foreground text-background"
                          : "text-muted-foreground hover:text-foreground"
                      )}
                    >
                      {absoluteLabel}
                    </button>
                  </div>
                </div>

                <div className="h-48 border border-border rounded-md p-3 bg-card">
                  {validPoints >= 1 ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={chartData} margin={{ top: 5, right: 8, left: -12, bottom: 0 }}>
                        <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
                        <XAxis
                          dataKey="label"
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          tickLine={false}
                          axisLine={false}
                        />
                        <YAxis
                          tick={{ fontSize: 10, fill: "hsl(var(--muted-foreground))" }}
                          tickLine={false}
                          axisLine={false}
                          width={48}
                          tickFormatter={(v) => formatValue(Number(v))}
                        />
                        {mode === "change" && (
                          <ReferenceLine y={0} stroke="hsl(var(--border))" strokeDasharray="2 2" />
                        )}
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
                              : [
                                  formatValue(Number(v)),
                                  mode === "change" ? "% cambio" : metric.name,
                                ]
                          }
                        />
                        <Line
                          type="monotone"
                          dataKey="value"
                          stroke="hsl(var(--foreground))"
                          strokeWidth={1.5}
                          dot={{ r: 2, fill: "hsl(var(--foreground))" }}
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
                <p className="text-[11px] text-tertiary mt-2">
                  {mode === "change"
                    ? "Variación porcentual respecto al mes anterior."
                    : `Valor absoluto por mes (${absoluteLabel}).`}
                </p>
              </div>
            )}

            {sorted.length === 1 && (
              <div className="text-xs text-muted-foreground border border-dashed border-border rounded-md p-3">
                Hay un solo período cargado ({monthShort[sorted[0].month - 1]} {sorted[0].year}:{" "}
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
