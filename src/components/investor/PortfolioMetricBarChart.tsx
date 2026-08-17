import { Bar, BarChart, CartesianGrid, Cell, LabelList, ResponsiveContainer, Tooltip as RTooltip, XAxis, YAxis } from "recharts";
import { formatRequirementValue, type MetricRequirement } from "@/lib/metricRequirements";

type Row = { name: string; value: number | null; status: string };

// Comparación de magnitud entre startups para UNA métrica — un solo hue
// (identidad ya la da el nombre en el eje, no hace falta paleta categórica).
// Barras sin dato se pintan con el token muted, nunca 0 inventado: la
// etiqueta dice "Sin datos" en vez de un valor real de 0 indistinguible.
export function PortfolioMetricBarChart({ requirement, rows }: { requirement: MetricRequirement; rows: Row[] }) {
  const data = rows
    .slice()
    .sort((a, b) => (b.value ?? -Infinity) - (a.value ?? -Infinity))
    .map((r) => ({
      name: r.name,
      value: r.value,
      displayValue: r.value ?? 0,
      label: r.value === null ? "Sin datos" : formatRequirementValue(r.value, requirement),
    }));

  const height = Math.max(120, data.length * 40 + 16);

  return (
    <div style={{ height }}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={data} layout="vertical" margin={{ top: 4, right: 56, left: 4, bottom: 4 }} barCategoryGap={10}>
          <CartesianGrid stroke="hsl(var(--border))" strokeDasharray="2 4" horizontal={false} />
          <XAxis type="number" hide />
          <YAxis
            type="category"
            dataKey="name"
            width={130}
            tick={{ fontSize: 12, fill: "hsl(var(--foreground))" }}
            tickLine={false}
            axisLine={false}
          />
          <RTooltip
            cursor={{ fill: "hsl(var(--surface))" }}
            contentStyle={{
              background: "hsl(var(--background))",
              border: "1px solid hsl(var(--border))",
              borderRadius: 6,
              fontSize: 12,
            }}
            formatter={(_: unknown, __: string, item: { payload?: Row & { label: string } }) => [
              item?.payload?.label ?? "—",
              requirement.name,
            ]}
          />
          <Bar dataKey="displayValue" radius={[0, 4, 4, 0]} maxBarSize={22}>
            {data.map((d) => (
              <Cell key={d.name} fill={d.value === null ? "hsl(var(--border))" : "hsl(var(--primary))"} />
            ))}
            <LabelList dataKey="label" position="right" fontSize={11} fill="hsl(var(--muted-foreground))" />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </div>
  );
}
