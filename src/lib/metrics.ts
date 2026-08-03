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

export function formatMetricValue(value: number | null, unit: string | null): string {
  if (value === null || value === undefined) return "—";
  const abs = Math.abs(value);
  if (unit === "USD") {
    if (abs >= 1_000_000) return `$${(value / 1_000_000).toFixed(1)}M`;
    if (abs >= 1_000) return `$${(value / 1_000).toFixed(1)}k`;
    return `$${value.toFixed(0)}`;
  }
  if (unit === "%") return `${value.toFixed(1)}%`;
  if (unit === "x") return `${value.toFixed(2)}x`;
  if (unit === "meses") return `${value.toFixed(1)} meses`;
  if (abs >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000) return `${(value / 1_000).toFixed(1)}k`;
  return value.toLocaleString(undefined, { maximumFractionDigits: 2 });
}
