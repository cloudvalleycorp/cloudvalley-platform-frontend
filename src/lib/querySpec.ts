// CAPA: Query Spec — el árbol estructurado que reemplaza a formula_expression
// (texto libre) para una métrica calculada nueva. Lo arma el QueryBuilder
// visual (src/components/metrics/query-builder/), lo manda upsert-metric-
// definition tal cual (el backend lo calcula, el frontend nunca lo
// interpreta/ejecuta) — a diferencia de formulaEngine.ts, este archivo NO
// evalúa nada, solo define la forma, la valida, y la resume en texto legible
// para mostrarla (confirmation card del agente, MetricInfoSheet, etc.).
// Métricas viejas con solo formula_expression (sin query) siguen mostrándose
// de solo lectura vía ese campo — no hay conversión automática a query.

export type AggregationFn = "sum" | "count" | "count_distinct" | "average";
export type FilterOperator = "in" | "==" | "!=" | "<" | "<=" | ">" | ">=" | "between";

// Firestore solo permite UN campo de rango/desigualdad por query — ver
// findRangeConflicts más abajo.
export const RANGE_OPERATORS: readonly FilterOperator[] = ["<", "<=", ">", ">=", "between"];

// Contrato confirmado con backend 2026-08-11 — la forma del valor depende
// del operador, no es siempre "values" como decía la primera versión del
// contrato:
//   "in"                              → values: [...]      (array, plural)
//   "between"                         → value: [min, max]  (array de 2, bajo la clave singular)
//   "==" | "!=" | "<" | "<=" | ">" | ">=" → value: escalar
export type QueryFilter = {
  field_key: string;
  operator: FilterOperator;
  values?: (string | number)[];
  value?: string | number | [string | number, string | number];
};
// Texto legible del valor de un filtro para el resumen — ver summarizeNode.
export function filterValueLabel(f: QueryFilter): string {
  if (f.operator === "in") return (f.values ?? []).join(", ");
  if (f.operator === "between") {
    const v = Array.isArray(f.value) ? f.value : null;
    return v && v.length === 2 ? `${v[0]} y ${v[1]}` : "(sin definir)";
  }
  return f.value !== undefined && !Array.isArray(f.value) ? String(f.value) : "(sin definir)";
}
// ¿Este filtro tiene un valor completo cargado? — ver validateNode.
export function filterHasValue(f: QueryFilter): boolean {
  if (f.operator === "in") return (f.values?.length ?? 0) > 0;
  if (f.operator === "between") {
    const v = Array.isArray(f.value) ? f.value : null;
    return !!v && v.length === 2 && v[0] !== "" && v[1] !== "" && v[0] != null && v[1] != null;
  }
  return f.value !== undefined && f.value !== null && f.value !== "" && !Array.isArray(f.value);
}
// window ausente → puntual (solo el período evaluado).
// window: {months: null} → acumulado, sin límite inferior (desde el primer dato).
// window: {months: N} → ventana móvil de N meses terminando en el período evaluado.
// Semántica confirmada con backend 2026-08-11 — las tres son distintas, no
// intercambiables.
export type QueryWindow = { months: number | null };

export type AggregationNode = {
  type: "aggregation";
  aggregation: AggregationFn;
  // field_key: requerido para sum/average. distinct_field_key: requerido
  // para count_distinct. Ninguno de los dos para count puro — confirmado
  // con backend 2026-08-11.
  field_key: string | null;
  distinct_field_key: string | null;
  filters: QueryFilter[];
  window?: QueryWindow;
};
export type MetricRefNode = { type: "metric_ref"; metric_id: string };
export type ConstantNode = { type: "constant"; value: number };
export type ArithmeticOperator = "+" | "-" | "*" | "/";
export type ArithmeticNode = { type: "arithmetic"; operator: ArithmeticOperator; left: QuerySpec; right: QuerySpec };
export type QuerySpec = AggregationNode | MetricRefNode | ConstantNode | ArithmeticNode;

export function blankAggregationNode(): AggregationNode {
  return { type: "aggregation", aggregation: "sum", field_key: null, distinct_field_key: null, filters: [] };
}
export function blankMetricRefNode(): MetricRefNode {
  return { type: "metric_ref", metric_id: "" };
}
export function blankConstantNode(): ConstantNode {
  return { type: "constant", value: 0 };
}
// El operando actual pasa a ser "left", "right" arranca en blanco salvo que
// se pase uno — usado tanto para "combinar con…" (envolver un nodo
// existente) como por QueryNodeEditor para el caso arithmetic en general.
export function wrapInArithmetic(op: ArithmeticOperator, left: QuerySpec, right?: QuerySpec): ArithmeticNode {
  return { type: "arithmetic", operator: op, left, right: right ?? blankAggregationNode() };
}

const NODE_TYPES = new Set(["aggregation", "metric_ref", "constant", "arithmetic"]);
// Guard defensivo, no una validación profunda — solo confirma que "parece"
// un QuerySpec para no romper el render con lo que venga de list-metrics
// (backend puede mandar null, o el shape viejo sin query).
export function isQuerySpec(v: unknown): v is QuerySpec {
  return !!v && typeof v === "object" && "type" in v && NODE_TYPES.has((v as { type: unknown }).type as string);
}

export type QueryValidationIssue = { path: string; message: string };

function validateNode(q: QuerySpec, path: string, selfMetricId: string | undefined, issues: QueryValidationIssue[]): void {
  if (q.type === "aggregation") {
    if ((q.aggregation === "sum" || q.aggregation === "average") && !q.field_key) {
      issues.push({ path, message: "Falta elegir el campo a sumar o promediar." });
    }
    if (q.aggregation === "count_distinct" && !q.distinct_field_key) {
      issues.push({ path, message: "Falta elegir el campo para contar valores únicos." });
    }
    for (const [i, f] of q.filters.entries()) {
      if (!f.field_key) issues.push({ path: `${path} → filtro ${i + 1}`, message: "Falta elegir el campo del filtro." });
      if (!filterHasValue(f)) issues.push({ path: `${path} → filtro ${i + 1}`, message: "Falta cargar al menos un valor en el filtro." });
    }
  } else if (q.type === "metric_ref") {
    if (!q.metric_id.trim()) issues.push({ path, message: "Falta elegir qué métrica referenciar." });
    else if (selfMetricId && q.metric_id === selfMetricId) issues.push({ path, message: "Una métrica no puede referenciarse a sí misma." });
  } else if (q.type === "constant") {
    if (!Number.isFinite(q.value)) issues.push({ path, message: "El valor constante no es un número válido." });
  } else {
    validateNode(q.left, `${path} → izquierda`, selfMetricId, issues);
    validateNode(q.right, `${path} → derecha`, selfMetricId, issues);
  }
}

export function validateQuery(q: QuerySpec | null, opts?: { selfMetricId?: string }): QueryValidationIssue[] {
  if (!q) return [{ path: "raíz", message: "Definí la consulta de la métrica." }];
  const issues: QueryValidationIssue[] = [];
  validateNode(q, "raíz", opts?.selfMetricId, issues);
  return issues;
}

function collectRangeConflicts(
  q: QuerySpec,
  path: string,
  out: { nodePath: string; fields: string[] }[]
): void {
  if (q.type === "aggregation") {
    const rangeFields = q.filters.filter((f) => RANGE_OPERATORS.includes(f.operator)).map((f) => f.field_key);
    if (rangeFields.length > 1) out.push({ nodePath: path, fields: rangeFields });
  } else if (q.type === "arithmetic") {
    collectRangeConflicts(q.left, `${path} → izquierda`, out);
    collectRangeConflicts(q.right, `${path} → derecha`, out);
  }
}

// Firestore permite un solo campo de rango/desigualdad por query — cada nodo
// aggregation del árbol se chequea de forma independiente (dos aggregations
// distintas combinadas por un arithmetic pueden tener, cada una, su propio
// campo de rango sin problema).
export function findRangeConflicts(q: QuerySpec | null): { nodePath: string; fields: string[] }[] {
  if (!q) return [];
  const out: { nodePath: string; fields: string[] }[] = [];
  collectRangeConflicts(q, "raíz", out);
  return out;
}

const AGGREGATION_LABELS: Record<AggregationFn, string> = {
  sum: "Suma",
  count: "Cantidad",
  count_distinct: "Cantidad distinta",
  average: "Promedio",
};
const OPERATOR_LABELS: Record<FilterOperator, string> = {
  in: "en",
  "==": "=",
  "!=": "≠",
  "<": "<",
  "<=": "≤",
  ">": ">",
  ">=": "≥",
  between: "entre",
};
const ARITHMETIC_SYMBOLS: Record<ArithmeticOperator, string> = { "+": "+", "-": "-", "*": "×", "/": "÷" };

export type SummarizeQueryContext = { rawFieldLabel?: (key: string) => string; metricLabel?: (id: string) => string };

function summarizeNode(q: QuerySpec, ctx: SummarizeQueryContext, topLevel: boolean): string {
  if (q.type === "constant") return String(q.value);
  if (q.type === "metric_ref") return q.metric_id ? (ctx.metricLabel?.(q.metric_id) ?? q.metric_id) : "(sin elegir)";
  if (q.type === "aggregation") {
    const fieldKey = q.aggregation === "count_distinct" ? q.distinct_field_key : q.field_key;
    const fieldLabel = fieldKey ? (ctx.rawFieldLabel?.(fieldKey) ?? fieldKey) : q.aggregation === "count" ? "filas" : "(sin elegir)";
    let out = `${AGGREGATION_LABELS[q.aggregation]} de ${fieldLabel}`;
    if (q.filters.length > 0) {
      const filterText = q.filters
        .map((f) => `${ctx.rawFieldLabel?.(f.field_key) ?? f.field_key} ${OPERATOR_LABELS[f.operator]} ${filterValueLabel(f)}`)
        .join(", ");
      out += ` (${filterText})`;
    }
    if (q.window) out += q.window.months == null ? " (acumulado)" : ` (últimos ${q.window.months} meses)`;
    return out;
  }
  const left = summarizeNode(q.left, ctx, false);
  const right = summarizeNode(q.right, ctx, false);
  const inner = `${q.left.type === "arithmetic" ? `(${left})` : left} ${ARITHMETIC_SYMBOLS[q.operator]} ${q.right.type === "arithmetic" ? `(${right})` : right}`;
  return topLevel ? inner : inner;
}

// Resumen legible en una línea — ej. "Suma de amount (evento en New) ÷ Clientes".
export function summarizeQuery(q: QuerySpec | null, ctx: SummarizeQueryContext = {}): string {
  if (!q) return "Sin definir";
  return summarizeNode(q, ctx, true);
}
