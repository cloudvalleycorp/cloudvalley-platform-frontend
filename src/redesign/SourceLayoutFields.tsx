import { GridLayoutMapping } from "@/components/metrics/GridLayoutMapping";
import { EavLayoutMapping } from "@/components/metrics/EavLayoutMapping";
import type { ConceptAxisEntry, EavMetricMapping, PeriodAxisEntry } from "@/lib/sheetsIntegration";

const periods: PeriodAxisEntry[] = [{ index: 1, period: "2026-07", confidence: { score: 1, basis: "demo" } }, { index: 2, period: "2026-08", confidence: { score: 1, basis: "demo" } }];
const concepts: ConceptAxisEntry[] = [{ index: 1, label: "Ingresos", suggested_field_key: "ingresos", value_type: "number", data_maturity: "raw", confidence: { score: 1, basis: "demo" } }];
const eav: EavMetricMapping[] = [{ observed_value: "Ingresos", field_key: "ingresos", value_type: "number", data_maturity: "raw", confidence: { score: 1, basis: "demo" } }];

export function SourceLayoutSummary({ fields }: { fields: Record<string, string | boolean> }) {
  if (fields.structure === "grid") {
    const rows: ConceptAxisEntry[] = JSON.parse(String(fields.concept_axis || "[]"));
    return <dl className="rd-review">{rows.map(row => <div key={row.index}><dt>{row.label}</dt><dd>{row.suggested_field_key} · {row.value_type === "number" ? "Número" : "Texto"} · {row.data_maturity === "raw" ? "Dato crudo" : "Calculado en la planilla"}</dd></div>)}</dl>;
  }
  if (fields.structure === "eav") {
    const rows: EavMetricMapping[] = JSON.parse(String(fields.eav_metric_mapping || "[]"));
    return <dl className="rd-review">{rows.map((row, i) => <div key={i}><dt>{row.observed_value}</dt><dd>{row.field_key} · {row.value_type === "number" ? "Número" : "Texto"} · {row.data_maturity === "raw" ? "Dato crudo" : "Calculado en la planilla"}</dd></div>)}</dl>;
  }
  return null;
}

export function SourceLayoutFields({ fields, onChange }: { fields: Record<string, string | boolean>; onChange: (fields: Record<string, string | boolean>) => void }) {
  const set = (key: string, value: string) => onChange({ ...fields, [key]: value });
  const structure = String(fields.structure || "tabular");
  return <div className="rd-mapped-form rd-source-layout">
    <div className="rd-mapped-field"><label htmlFor="source-structure">Estructura de la hoja</label><select id="source-structure" value={structure} onChange={e => onChange({ ...fields, structure: e.target.value, period_orientation: fields.period_orientation || "columns", period_axis: fields.period_axis || JSON.stringify(periods), concept_axis: fields.concept_axis || JSON.stringify(concepts), eav_period_column: fields.eav_period_column || "Fecha", eav_metric_name_column: fields.eav_metric_name_column || "Métrica", eav_value_column: fields.eav_value_column || "Valor", eav_metric_mapping: fields.eav_metric_mapping || JSON.stringify(eav) })}><option value="tabular">Una fila por período</option><option value="grid">Cuadrícula</option><option value="eav">Vertical (EAV)</option></select></div>
    {structure !== "tabular" && <p className="rd-muted">Estructura de ejemplo. El reconocimiento automático requiere una fuente conectada.</p>}
    {structure === "grid" && <><div className="rd-mapped-field"><label htmlFor="period-orientation">Ubicación de los períodos</label><select id="period-orientation" value={String(fields.period_orientation || "columns")} onChange={e => set("period_orientation", e.target.value)}><option value="columns">En columnas</option><option value="rows">En filas</option></select></div><GridLayoutMapping periodOrientation={fields.period_orientation === "rows" ? "rows" : "columns"} periodAxis={JSON.parse(String(fields.period_axis || JSON.stringify(periods)))} conceptAxis={JSON.parse(String(fields.concept_axis || JSON.stringify(concepts)))} onChange={value => set("concept_axis", JSON.stringify(value))} /></>}
    {structure === "eav" && <>{[["eav_period_column", "Columna del período"], ["eav_metric_name_column", "Columna del nombre de métrica"], ["eav_value_column", "Columna del valor"]].map(([id, label]) => <div className="rd-mapped-field" key={id}><label htmlFor={id}>{label}</label><select id={id} value={String(fields[id] || "")} onChange={e => set(id, e.target.value)}>{["Fecha", "Métrica", "Valor"].map(name => <option key={name}>{name}</option>)}</select></div>)}<EavLayoutMapping periodColumn={String(fields.eav_period_column)} metricNameColumn={String(fields.eav_metric_name_column)} valueColumn={String(fields.eav_value_column)} metricMapping={JSON.parse(String(fields.eav_metric_mapping || JSON.stringify(eav)))} onChange={value => set("eav_metric_mapping", JSON.stringify(value))} /></>}
  </div>;
}
