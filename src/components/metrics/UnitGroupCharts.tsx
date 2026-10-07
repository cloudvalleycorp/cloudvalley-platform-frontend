import { useState } from "react";
import { CartesianGrid, Line, LineChart, ResponsiveContainer, XAxis, YAxis } from "recharts";
import { groupByUnit, seriesColor } from "@/lib/reportChartGroups";
import { formatMetricValue } from "@/lib/metrics";
import { cn } from "@/lib/utils";

// Gráficos de KPIs del reporte, opción A aprobada: un gráfico por unidad, para no
// mezclar escalas. Los KPIs son chips que prenden y apagan su línea. Un período
// sin dato corta la línea (connectNulls=false): nunca se dibuja un cero.

export type ChartSeries = {
  name: string;
  unit: string | null;
  // Serie de los seis meses, del más viejo al actual. null = sin dato ese mes.
  spark: (number | null)[];
  // Valor del período del reporte. null = sin dato.
  current: number | null;
};

type Props = {
  series: ChartSeries[];
  // Meses abreviados del eje X ("may", "jun", ...).
  months: string[];
};

function axisValue(value: number, unit: string | null): string {
  return formatMetricValue(Math.round(value), unit);
}

export function UnitGroupCharts({ series, months }: Props) {
  // Series apagadas por nombre. Por defecto todas prendidas.
  const [hidden, setHidden] = useState<Set<string>>(() => new Set());
  const toggle = (name: string) =>
    setHidden((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });

  if (series.length === 0) return null;
  // Clave por posición en la lista completa: dos KPIs con el mismo nombre no se pisan.
  const keyOf = (s: ChartSeries) => `s${series.indexOf(s)}`;
  // Solo grupos con alguna serie que tenga dato: un grupo sin datos no ocupa lugar.
  const groups = groupByUnit(series).filter((g) => g.items.some((s) => s.spark.some((v) => v != null)));
  // Color estable por posición dentro del grupo, igual que en el PDF.
  const colorOf = new Map<string, string>();
  for (const group of groups) group.items.forEach((s, i) => colorOf.set(s.name, seriesColor(i)));

  return (
    <div className="mt-6 space-y-4">
      <div role="group" aria-label="KPIs del gráfico" className="flex flex-wrap gap-2">
        {series.map((s) => {
          const pressed = !hidden.has(s.name);
          const color = colorOf.get(s.name) ?? seriesColor(0);
          return (
            <button
              key={s.name}
              type="button"
              aria-pressed={pressed}
              onClick={() => toggle(s.name)}
              className={cn(
                "flex items-center gap-2 h-9 px-3 rounded-lg border text-sm transition-colors",
                pressed ? "border-border bg-card text-foreground" : "border-dashed border-border text-muted-foreground"
              )}
            >
              <span aria-hidden="true" className="w-2.5 h-2.5 rounded-sm" style={{ background: pressed ? color : "transparent", border: `1px solid ${color}` }} />
              <span>{s.name}</span>
              <span className="font-medium tabular-nums">
                {s.current == null ? "Sin dato" : formatMetricValue(s.current, s.unit)}
              </span>
            </button>
          );
        })}
      </div>

      {groups.length === 0 ? (
        <p className="py-6 text-center text-sm text-muted-foreground">Sin serie para mostrar en estos meses.</p>
      ) : null}

      {groups.map((group) => {
        const unit = group.items[0]?.unit ?? null;
        const visible = group.items.filter((s) => !hidden.has(s.name) && s.spark.some((v) => v != null));
        const rows = months.map((m, idx) => {
          const row: Record<string, string | number | null> = { m };
          for (const s of visible) row[keyOf(s)] = s.spark[idx] ?? null;
          return row;
        });
        return (
          <section key={group.key} aria-label={`Gráfico en ${group.key}`}>
            <p className="text-xs uppercase tracking-wide text-muted-foreground">{group.key}</p>
            {visible.length === 0 ? (
              <p className="py-6 text-center text-sm text-muted-foreground">Sin serie para mostrar en estos meses.</p>
            ) : (
              <div className="h-[200px] mt-2">
                <ResponsiveContainer width="100%" height="100%">
                  <LineChart data={rows} margin={{ top: 8, right: 16, bottom: 0, left: 0 }}>
                    <CartesianGrid vertical={false} stroke="hsl(var(--border))" />
                    <XAxis dataKey="m" tick={{ fontSize: 12 }} tickLine={false} />
                    <YAxis tick={{ fontSize: 12 }} width={96} tickLine={false} domain={["auto", "auto"]} tickFormatter={(v) => axisValue(Number(v), unit)} />
                    {visible.map((s) => (
                      <Line
                        key={keyOf(s)}
                        type="linear"
                        dataKey={keyOf(s)}
                        stroke={colorOf.get(s.name) ?? seriesColor(0)}
                        strokeWidth={2}
                        dot={false}
                        connectNulls={false}
                        isAnimationActive={false}
                      />
                    ))}
                  </LineChart>
                </ResponsiveContainer>
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
