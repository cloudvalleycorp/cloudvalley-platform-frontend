// CAPA: Metrics Registry / Domain del Growth Tracker — el modelo de una
// métrica (tipos, formatters) independiente de dónde se guarda. El catálogo
// real vive en backend (list-metrics/upsert-metric-definition, ver
// lib/financialData.ts); esto es la forma en que el frontend lo entiende.
import type { FinancialMetricDef } from "@/lib/financialData";

export type MetricType = "input" | "calculated";
// "text" cubre el caso borde de una métrica que muestra directamente un
// campo crudo de texto (no el uso principal — los campos crudos viven en
// las conexiones, no en el catálogo de métricas, ver RawField más abajo).
export type ValueType = "money" | "count" | "percentage" | "text";

export type MetricDef = {
  id: string;
  name: string;
  category: string;
  metric_type: MetricType;
  input_key: string | null;
  value_type: ValueType | null;
  // Which source currently feeds this input metric — null/"manual_form" means
  // it's typed in by hand; anything else ("sheet", "stripe", ...) means an
  // integration owns it now and InputsPanel/AnnualGrid show it read-only.
  // Always null for metric_type "calculated" (not applicable).
  // NOTE: desde el rediseño a datos crudos + FIELDSUM-style fórmulas, una
  // integración ya no llena un input_key directamente — llena un RawField
  // (ver más abajo), consumido desde una fórmula de una métrica calculada.
  // Backend confirma que source/source_connection_id vienen siempre null
  // ahora — el bloqueo de carga manual en InputsPanel/AnnualGrid queda
  // dormido para datos de integraciones (las métricas calculadas nunca
  // tuvieron carga manual de por sí), no se retira el código porque sigue
  // siendo correcto (source null = editable), solo deja de activarse acá.
  source: string | null;
  // Qué conexión (de posiblemente varias) es responsable — solo se usaba
  // cuando source !== null. Ver nota arriba.
  source_connection_id: string | null;
  formula_expression: string | null;
  unit: string | null;
  formula: string | null;
  description: string | null;
  why_it_matters: string | null;
  benchmark: string | null;
  order_index: number;
};

const SOURCE_LABELS: Record<string, string> = {
  sheet: "Google Sheets",
  stripe: "Stripe",
};

/** Human label for an automated source, or null when the field is manual (nothing to show). */
export function sourceLabel(source: string | null): string | null {
  if (!source || source === "manual_form") return null;
  return SOURCE_LABELS[source] ?? source;
}

const SOURCE_SETTINGS_PATHS: Record<string, string> = {
  sheet: "/growth-tracker/sheets",
};

/**
 * Where to send the user to fix a value that comes from an automated source
 * — null if that integration has no settings screen yet. For "sheet", a
 * company can have several connections at once, so connectionId (when
 * known) links straight to the one responsible instead of a generic list
 * the user has to search through.
 */
export function sourceSettingsPath(source: string | null, connectionId?: string | null): string | null {
  if (!source) return null;
  const base = SOURCE_SETTINGS_PATHS[source];
  if (!base) return null;
  return connectionId ? `${base}?connection_id=${encodeURIComponent(connectionId)}` : base;
}

// Un campo crudo traído por una integración (Sheets, a futuro Stripe) — vive
// en el namespace de la conexión, NO es una métrica ni aparece en el
// catálogo de Métricas. Solo se usa como argumento de FIELDSUM/FIELDCOUNT/
// FIELDCOUNTD/FIELDAVG dentro de una fórmula (ver formulaEngine.ts). Viene
// de GET /list-raw-fields.
export type RawField = {
  field_key: string;
  value_type: "number" | "text";
  connection_id: string;
  sample_column: string;
};

export type InputsMap = Record<string, number>; // input_key -> value

// One period's worth of raw inputs, tagged with when it is — needed by
// SUMLAST/AVGLAST/YTD (src/lib/formulaEngine.ts) to know how far back "last
// N months" or "this year" reaches. Chronological, oldest first; the last
// entry should be the "current" period being evaluated.
export type PeriodInputs = { month: number; year: number; values: InputsMap };

// Shared formatter for a raw input value given its value_type (money/count/
// percentage) — used everywhere a "campo" is entered or listed as a formula
// suggestion, so $ / % / plain-number formatting stays consistent.
export function formatValueByType(value: number | undefined | null, valueType: ValueType | null | undefined): string {
  if (value === undefined || value === null) return "—";
  if (valueType === "money") return `$${value.toLocaleString()}`;
  if (valueType === "percentage") return `${value.toLocaleString()}%`;
  return value.toLocaleString();
}

// Maps the GCP financial module's metric shape onto the frontend's MetricDef
// — used by every hook/page that reads GET /list-metrics.
export function toMetricDef(d: FinancialMetricDef): MetricDef {
  return {
    id: d.metric_id,
    name: d.name,
    category: d.category,
    metric_type: d.metric_type,
    input_key: d.input_key,
    value_type: d.value_type ?? null,
    source: d.source ?? null,
    source_connection_id: d.source_connection_id ?? null,
    formula_expression: d.formula_expression,
    unit: d.unit,
    formula: d.formula_expression,
    description: d.description ?? null,
    why_it_matters: d.why_it_matters ?? null,
    benchmark: d.benchmark ?? null,
    order_index: d.display_order,
  };
}

// Percent change between two metric values, null when either side is
// missing or the comparison is meaningless (division by zero).
export function percentChange(current: number | null, prev: number | null): number | null {
  if (current == null || prev == null || prev === 0) return null;
  return ((current - prev) / Math.abs(prev)) * 100;
}

// Miles/millones/miles de millones/billones, en ese orden de magnitud —
// antes se cortaba en "M" (millones), así que 12.345.678.910 se mostraba
// "$12345.7M" en vez de "$12.3B". `i > 0` en el chequeo de borde evita
// mostrar "1000.0M" cuando el redondeo a 1 decimal cruza al tier de arriba
// (ej. 999.999.999.999 → "1000.0B" en vez de "1.0T").
const SCALE_TIERS = [
  { divisor: 1_000_000_000_000, suffix: "T" },
  { divisor: 1_000_000_000, suffix: "B" },
  { divisor: 1_000_000, suffix: "M" },
  { divisor: 1_000, suffix: "k" },
] as const;

function abbreviateScale(value: number): string {
  for (let i = 0; i < SCALE_TIERS.length; i++) {
    const { divisor, suffix } = SCALE_TIERS[i];
    if (Math.abs(value) < divisor) continue;
    const scaled = value / divisor;
    if (Math.abs(scaled) >= 999.95 && i > 0) {
      const up = SCALE_TIERS[i - 1];
      return `${(value / up.divisor).toFixed(1)}${up.suffix}`;
    }
    return `${scaled.toFixed(1)}${suffix}`;
  }
  return value.toFixed(0);
}

export function formatMetricValue(value: number | null, unit: string | null): string {
  if (value === null || value === undefined) return "—";
  const abs = Math.abs(value);
  if (unit === "USD") {
    if (abs >= 1_000) return `$${abbreviateScale(value)}`;
    return `$${value.toFixed(0)}`;
  }
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "x") return `${value.toFixed(2)}x`;
  if (unit === "meses") return `${value.toFixed(1)} meses`;
  if (abs >= 1_000) return abbreviateScale(value);
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
