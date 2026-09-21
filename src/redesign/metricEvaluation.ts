import { validateQuery, type QueryFilter, type QuerySpec } from "@/lib/querySpec";
import type { RecordItem } from "./model";

export type MetricResult = { value?: number | string; reason?: string; sources: string[] };
const monthIndex = (period: string) => Number(period.slice(0, 4)) * 12 + Number(period.slice(5)) - 1;
const monthLabel = (index: number) => `${Math.floor(index / 12)}-${String(index % 12 + 1).padStart(2, "0")}`;
const missing = (reason: string): MetricResult => ({ reason, sources: [] });
function matches(values: Record<string, string>, filter: QueryFilter): boolean {
  const raw = values[filter.field_key];
  if (raw === undefined) return false;
  const equal = (value: string | number) => typeof value === "number" ? raw.trim() !== "" && Number(raw) === value : raw === value;
  if (filter.operator === "in") return (filter.values || []).some(equal);
  if (filter.operator === "==") return equal(filter.value as string | number);
  if (filter.operator === "!=") return !equal(filter.value as string | number);
  const compare = (value: string | number) => typeof value === "number" ? (raw.trim() && Number.isFinite(Number(raw)) ? Number(raw) - value : NaN) : raw < value ? -1 : raw > value ? 1 : 0;
  if (filter.operator === "between") { const [low, high] = filter.value as [string | number, string | number]; return compare(low) >= 0 && compare(high) <= 0; }
  const difference = compare(filter.value as string | number);
  return filter.operator === "<" ? difference < 0 : filter.operator === "<=" ? difference <= 0 : filter.operator === ">" ? difference > 0 : difference >= 0;
}

/** Local demo only: never a replacement for production backend calculations. */
export function evaluateMetric(item: RecordItem, records: RecordItem[], period = "2026-08", scenario = "actual", path: string[] = []): MetricResult {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(period)) return missing("Elegí un período válido.");
  if (path.includes(item.id) || path.length >= 40) return missing("La consulta contiene referencias circulares o demasiado profundas.");
  if (!item.query) {
    const entry = item.entries?.[`${period}:${scenario}`];
    if (entry !== undefined && entry.trim() !== "") return { value: item.fields?.value_type === "text" ? entry : Number.isFinite(Number(entry)) ? Number(entry) : entry, sources: [] };
    return period === "2026-08" && scenario === "actual" && item.value && item.value !== "—" ? { value: item.value, sources: [] } : missing("No hay un valor guardado para este período.");
  }
  if (validateQuery(item.query, { selfMetricId: item.id }).length) return missing("Revisá la configuración de la consulta.");
  const evaluate = (node: QuerySpec, depth = 0): MetricResult => {
    if (depth > 40) return missing("La consulta es demasiado profunda.");
    if (node.type === "constant") return { value: node.value, sources: [] };
    if (node.type === "metric_ref") {
      const metric = records.find(r => r.area === "metrics" && r.id === node.metric_id);
      return metric ? evaluateMetric(metric, records, monthLabel(monthIndex(period) + (node.period_offset || 0)), scenario, [...path, item.id]) : missing("Una métrica de la consulta ya no está disponible.");
    }
    if (node.type === "arithmetic") {
      const left = evaluate(node.left, depth + 1); const right = evaluate(node.right, depth + 1);
      if (left.reason || right.reason) return missing(left.reason || right.reason!);
      if (typeof left.value !== "number" || typeof right.value !== "number") return missing("Falta un valor numérico en una métrica referenciada.");
      if (node.operator === "/" && right.value === 0) return missing("No se puede dividir por cero.");
      const value = node.operator === "+" ? left.value + right.value : node.operator === "-" ? left.value - right.value : node.operator === "*" ? left.value * right.value : left.value / right.value;
      return Number.isFinite(value) ? { value, sources: [...new Set([...left.sources, ...right.sources])] } : missing("El resultado excede el rango numérico.");
    }
    if (scenario !== "actual") return missing("Las fuentes importadas de la demo contienen únicamente datos reales.");
    const end = monthIndex(period); const start = !node.window ? end : node.window.months === null ? -Infinity : end - node.window.months + 1;
    const key = node.aggregation === "count_distinct" ? node.distinct_field_key : node.field_key;
    const candidates = records.filter(r => r.area === "sources").flatMap(source => (source.sourceRows || []).filter(row => monthIndex(row.period) >= start && monthIndex(row.period) <= end && (!key || key in row.values)).map(row => ({ ...row, source: source.id })));
    if (!candidates.length) return missing("No hay datos importados para los campos y períodos de esta consulta. Revisá y sincronizá una fuente.");
    const rows = candidates.filter(row => node.filters.every(filter => matches(row.values, filter)));
    const sources = [...new Set(candidates.map(row => row.source))];
    if (node.aggregation === "count") return { value: rows.length, sources };
    if (node.aggregation === "count_distinct") return { value: new Set(rows.map(row => row.values[key!])).size, sources };
    if (!rows.length) return node.aggregation === "sum" ? { value: 0, sources } : missing("Ningún dato coincide con los filtros.");
    const values = rows.map(row => row.values[key!].trim() === "" ? NaN : Number(row.values[key!]));
    if (values.some(value => !Number.isFinite(value))) return missing("La fuente contiene valores no numéricos para este campo.");
    const sum = values.reduce((total, value) => total + value, 0);
    const value = node.aggregation === "average" ? sum / values.length : sum;
    return Number.isFinite(value) ? { value, sources } : missing("El resultado excede el rango numérico.");
  };
  return evaluate(item.query);
}

export function metricDisplay(item: RecordItem | undefined, records: RecordItem[], period = "2026-08", scenario = "actual"): string {
  if (!item) return "Sin datos";
  const result = evaluateMetric(item, records, period, scenario);
  if (result.value === undefined) return "Sin datos";
  if (typeof result.value === "string") return result.value;
  const value = result.value.toLocaleString("es-AR", { maximumFractionDigits: 2 });
  return item.fields?.value_type === "money" ? `${item.fields.currency || "USD"} ${value}` : item.fields?.value_type === "percentage" ? `${value}%` : `${value}${item.fields?.unit ? ` ${item.fields.unit}` : ""}`;
}
