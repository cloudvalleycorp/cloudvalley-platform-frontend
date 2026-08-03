import { useMemo, useState } from "react";
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
import { formatMetricValue, percentChange, type MetricDef } from "@/lib/metrics";
import { MONTH_LABELS } from "@/lib/metricPeriod";
import { cn } from "@/lib/utils";

export type MetricHistoryPoint = { year: number; month: number; value: number };
type Mode = "change" | "absolute";

// Shared by MetricChartDialog (founder-facing, larger) and MetricInfoSheet
// (investor/compact) — callers are expected to already have confirmed
// `history.length >= 2` (they each show their own "not enough data yet"
// message otherwise, since that copy/layout differs between the two).
const SIZES = {
  lg: {
    heightClass: "h-96",
    margin: { top: 8, right: 16, left: 0, bottom: 0 },
    fontSize: 11,
    axisWidth: 60,
    strokeWidth: 2,
    dotRadius: 3,
  },
  sm: {
    heightClass: "h-48",
    margin: { top: 5, right: 8, left: -12, bottom: 0 },
    fontSize: 10,
    axisWidth: 48,
    strokeWidth: 1.5,
    dotRadius: 2,
  },
};

type Props = {
  metric: MetricDef;
  history?: MetricHistoryPoint[];
  size?: "lg" | "sm";
};

export function MetricHistoryChart({ metric, history, size = "lg" }: Props) {
  const [mode, setMode] = useState<Mode>("change");
  const s = SIZES[size];

  const absoluteLabel =
    metric.unit === "USD"
      ? "$"
      : metric.unit === "%"
      ? "%"
      : metric.unit === "x"
      ? "x"
      : metric.unit === "meses"
      ? "meses"
      : "valor";

  const sorted = useMemo(
    () => (history ?? []).slice().sort((a, b) => (a.year === b.year ? a.month - b.month : a.year - b.year)),
    [history]
  );

  const chartData = useMemo(() => {
    if (mode === "absolute") {
      return sorted.map((p) => ({
        label: `${MONTH_LABELS[p.month - 1]} ${String(p.year).slice(2)}`,
        value: p.value as number | null,
      }));
    }
    return sorted.map((p, i) => {
      if (i === 0) return { label: `${MONTH_LABELS[p.month - 1]} ${String(p.year).slice(2)}`, value: null as number | null };
      const prev = sorted[i - 1].value;
      return { label: `${MONTH_LABELS[p.month - 1]} ${String(p.year).slice(2)}`, value: percentChange(p.value, prev) };
    });
  }, [sorted, mode]);

  const validPoints = chartData.filter((d) => d.value !== null && d.value !== undefined).length;
  const formatValue = (v: number) =>
    mode === "absolute" ? formatMetricValue(v, metric.unit) : `${v >= 0 ? "+" : ""}${v.toFixed(1)}%`;

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h4 className="text-xs uppercase tracking-wide text-muted-foreground">Evolución</h4>
        <div className="inline-flex border border-border rounded-md overflow-hidden h-7">
          <button
            onClick={() => setMode("change")}
            aria-pressed={mode === "change"}
            className={cn(
              "px-2.5 text-[11px] transition-all",
              mode === "change" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            )}
          >
            % cambio
          </button>
          <button
            onClick={() => setMode("absolute")}
            aria-pressed={mode === "absolute"}
            className={cn(
              "px-2.5 text-[11px] transition-all border-l border-border",
              mode === "absolute" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
            )}
          >
            {absoluteLabel}
          </button>
        </div>
      </div>

      <div className={cn(s.heightClass, "border border-border rounded-md p-3 bg-card")}>
        {validPoints >= 1 ? (
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={chartData} margin={s.margin}>
              <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" vertical={false} />
              <XAxis
                dataKey="label"
                tick={{ fontSize: s.fontSize, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                interval="preserveStartEnd"
              />
              <YAxis
                tick={{ fontSize: s.fontSize, fill: "hsl(var(--muted-foreground))" }}
                tickLine={false}
                axisLine={false}
                width={s.axisWidth}
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
                strokeWidth={s.strokeWidth}
                dot={{ r: s.dotRadius, fill: "hsl(var(--foreground))" }}
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
        {mode === "change" ? "Variación porcentual respecto al mes anterior." : `Valor absoluto por mes (${absoluteLabel}).`}
      </p>
    </div>
  );
}
