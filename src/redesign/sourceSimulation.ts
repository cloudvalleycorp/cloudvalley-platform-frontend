import type { RawField } from "@/lib/metrics";
import type { SyncResult } from "@/lib/sheetsIntegration";
import type { RecordItem } from "./model";

export type SourceRow = { period: string; values: Record<string, string> };
export type SourceRun = { id: string; at: string; result: SyncResult };
export type SourceMapping = { key: string; column: string; type: string };
export function sourceMappings(item: RecordItem): SourceMapping[] {
  const fields = item.fields || {};
  try {
    if (fields.structure === "grid") return JSON.parse(String(fields.concept_axis || "[]")).map(r => ({ key: r.suggested_field_key, column: r.label, type: r.value_type }));
    if (fields.structure === "eav") return JSON.parse(String(fields.eav_metric_mapping || "[]")).map(r => ({ key: r.field_key, column: r.observed_value, type: r.value_type }));
    return JSON.parse(String(fields.field_mappings || "[]")).map(r => ({ key: r.field_key, column: r.column, type: r.value_type }));
  } catch { return []; }
}
const sample = [
  { period: "2026-06", Ingresos: "80000", Costos: "24000", Clientes: "100" },
  { period: "2026-07", Ingresos: "90000", Costos: "26000", Clientes: "112" },
  { period: "2026-08", Ingresos: "101000", Costos: "28000", Clientes: "125" },
];
export type SourcePreview = { rows: SourceRow[]; result: SyncResult };
export function previewSource(item: RecordItem, outcome: "success" | "partial" | "schema" = "success"): SourcePreview {
  const mappings = sourceMappings(item);
  const row_errors: SyncResult["row_errors"] = [];
  const result: SyncResult = { status: "ok", connection_id: item.id, import_log_id: null, rows_processed: 0, rows_rejected: 0, row_errors, inserted_rows: 0, updated_rows: 0, deleted_rows: 0, changed_formulas: 0 };
  if (!mappings.length || new Set(mappings.map(m => m.key)).size !== mappings.length || mappings.some(m => !m.key || !m.column)) { result.status = "error"; row_errors.push({ field: "Mapeo", reason: "Revisá el mapeo: faltan campos o hay claves duplicadas." }); return { rows: [], result }; }
  if (outcome === "schema" || mappings.some(m => !(m.column in sample[0]))) { result.status = "error"; row_errors.push({ field: mappings.find(m => !(m.column in sample[0]))?.column || mappings[0].column, reason: "La columna no existe en la muestra actual. Revisá el mapeo antes de sincronizar." }); return { rows: [], result }; }
  let selectedSample = sample;
  if (item.fields?.structure === "grid") {
    try { const periods: { period: string }[] = JSON.parse(String(item.fields.period_axis || "[]")); selectedSample = sample.filter(row => periods.some(period => period.period === row.period)); } catch { selectedSample = []; }
    if (!selectedSample.length) { result.status = "error"; row_errors.push({ field: "Períodos", reason: "Los períodos mapeados no están en la muestra de junio a agosto de 2026." }); return { rows: [], result }; }
  }
  const rows = selectedSample.flatMap((row, index) => {
    if (outcome === "partial" && index === 1) { row_errors.push({ field: mappings[0].column, period: row.period, row: index + 2, reason: "Valor numérico inválido en la muestra de error." }); result.rows_rejected++; return []; }
    return [{ period: row.period, values: Object.fromEntries(mappings.map(m => [m.key, row[m.column as keyof typeof row]])) }];
  });
  result.rows_processed = rows.length;
  rows.forEach(row => { const previous = item.sourceRows?.find(r => r.period === row.period); if (!previous) result.inserted_rows!++; else if (Object.keys(previous.values).length !== Object.keys(row.values).length || Object.entries(row.values).some(([key, value]) => previous.values[key] !== value)) result.updated_rows!++; });
  return { rows, result };
}
export function applySourcePreview(item: RecordItem, preview: SourcePreview, at = new Date().toISOString()): RecordItem {
  const id = crypto.randomUUID();
  const sourceRows = preview.result.status === "error" ? item.sourceRows : [...(item.sourceRows || []).filter(row => !preview.rows.some(next => next.period === row.period)), ...preview.rows].sort((a, b) => a.period.localeCompare(b.period));
  return { ...item, sourceRows, sourceRuns: [{ id, at, result: { ...preview.result, import_log_id: id } }, ...(item.sourceRuns || [])], status: preview.result.status === "error" || preview.result.rows_rejected ? "Revisar" : "Al día", fields: { ...item.fields, ...(preview.result.status !== "error" ? { last_synced_at: at } : {}) } };
}
export function sourceRawFields(records: RecordItem[]): RawField[] {
  return records.filter(r => r.area === "sources").flatMap(r => sourceMappings(r).map((m): RawField => ({ field_key: m.key, value_type: m.type === "text" ? "text" : "number", connection_id: r.id, sample_column: m.column, description: "Campo mapeado en la demo", connection_label: r.name })));
}
