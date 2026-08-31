// CAPA: lineage best-effort, puro y determinístico — complemento del
// endpoint real get-metric-lineage (ver metricIntelligence.ts), no su
// reemplazo. Sirve para dos cosas que el backend no expone: (1) una
// respuesta instantánea sin red mientras get-metric-lineage carga o falla,
// y (2) la resolución INVERSA "qué métricas usan este campo" (necesaria
// para avisar antes de romper una métrica al editar un mapeo, ver
// GrowthTrackerSheets.tsx) — get-metric-lineage va de métrica a fuente,
// nunca al revés.
import type { MetricDef, RawField } from "@/lib/metrics";
import type { AggregationNode, QuerySpec } from "@/lib/querySpec";

export type ResolvedSource = { connectionId: string; connectionLabel: string };

const MAX_DEPTH = 6;

// Un "nodo hoja" real de la query — a diferencia de resolveMetricSources
// (que solo junta qué conexiones participan), esto preserva CADA
// AggregationNode y CADA referencia a una métrica de tipo "input" tal como
// aparecen en el árbol, para poder mostrar el aporte de cada una por
// separado (desglose por fuente) en vez de solo la lista de conexiones.
export type LineageLeaf =
  | { kind: "aggregation"; connectionId: string; connectionLabel: string; node: AggregationNode }
  | { kind: "input"; metricId: string; metricName: string };

// Misma lógica de recorrido que resolveMetricSources (mismo límite de
// profundidad, misma protección contra referencias circulares vía
// visitedMetricIds) pero sin colapsar por conexión — cada hoja se
// preserva individualmente. Un MetricRefNode a una métrica "calculada" se
// expande recursivamente (su aporte se desglosa en sus propias hojas); a
// una métrica "input" se deja como hoja terminal (no tiene query, es un
// valor cargado a mano — "Carga manual" en el desglose).
export function resolveMetricSourceLeaves(metric: MetricDef, allMetrics: MetricDef[], rawFields: RawField[]): LineageLeaf[] {
  const leaves: LineageLeaf[] = [];
  const visitedMetricIds = new Set<string>();

  function walk(query: QuerySpec | null, depth: number) {
    if (!query || depth > MAX_DEPTH) return;
    if (query.type === "aggregation") {
      const key = query.aggregation === "count_distinct" ? query.distinct_field_key : query.field_key;
      if (!key) return; // "count" puro sin campo — no hay fuente que atribuir
      const field = rawFields.find((f) => f.field_key === key);
      if (!field) return;
      leaves.push({
        kind: "aggregation",
        connectionId: field.connection_id,
        connectionLabel: field.connection_label ?? field.connection_id,
        node: query,
      });
      return;
    }
    if (query.type === "metric_ref") {
      if (visitedMetricIds.has(query.metric_id)) return;
      visitedMetricIds.add(query.metric_id);
      const refMetric = allMetrics.find((m) => m.id === query.metric_id);
      if (!refMetric) return;
      if (refMetric.metric_type === "input") {
        leaves.push({ kind: "input", metricId: refMetric.id, metricName: refMetric.name });
      } else {
        walk(refMetric.query, depth + 1);
      }
      return;
    }
    if (query.type === "arithmetic") {
      walk(query.left, depth + 1);
      walk(query.right, depth + 1);
    }
    // "constant": no aporta ninguna fuente real, se omite.
  }

  walk(metric.query, 0);
  return leaves;
}

function collectFieldKeys(query: QuerySpec | null, out: Set<string>) {
  if (!query) return;
  switch (query.type) {
    case "aggregation":
      if (query.field_key) out.add(query.field_key);
      if (query.distinct_field_key) out.add(query.distinct_field_key);
      for (const f of query.filters ?? []) out.add(f.field_key);
      return;
    case "arithmetic":
      collectFieldKeys(query.left, out);
      collectFieldKeys(query.right, out);
      return;
    case "metric_ref":
    case "constant":
      return;
  }
}

function collectMetricRefs(query: QuerySpec | null, out: Set<string>) {
  if (!query) return;
  switch (query.type) {
    case "metric_ref":
      out.add(query.metric_id);
      return;
    case "arithmetic":
      collectMetricRefs(query.left, out);
      collectMetricRefs(query.right, out);
      return;
    default:
      return;
  }
}

/** Todas las fuentes (conexiones) reales detrás de una métrica — camina el árbol de su query, incluyendo las de cualquier métrica que referencie, con límite de profundidad contra referencias circulares. Multi-fuente aware: una métrica puede combinar campos de 2+ conexiones. */
export function resolveMetricSources(metric: MetricDef, allMetrics: MetricDef[], rawFields: RawField[]): ResolvedSource[] {
  const fieldKeys = new Set<string>();
  const visitedMetricIds = new Set<string>();
  const stack: { query: QuerySpec | null; depth: number }[] = [{ query: metric.query, depth: 0 }];
  while (stack.length > 0) {
    const { query, depth } = stack.pop()!;
    if (!query || depth > MAX_DEPTH) continue;
    collectFieldKeys(query, fieldKeys);
    const refs = new Set<string>();
    collectMetricRefs(query, refs);
    for (const refId of refs) {
      if (visitedMetricIds.has(refId)) continue;
      visitedMetricIds.add(refId);
      const refMetric = allMetrics.find((m) => m.id === refId);
      if (refMetric) stack.push({ query: refMetric.query, depth: depth + 1 });
    }
  }
  const byConnection = new Map<string, string>();
  for (const key of fieldKeys) {
    const field = rawFields.find((f) => f.field_key === key);
    if (field) byConnection.set(field.connection_id, field.connection_label ?? field.connection_id);
  }
  return Array.from(byConnection.entries()).map(([connectionId, connectionLabel]) => ({ connectionId, connectionLabel }));
}

/** Inversa de resolveMetricSources — qué métricas de la company referencian este field_key (directa o indirectamente, vía metric_ref). Usada para avisar antes de romper algo al editar/desmarcar un campo mapeado. */
export function findMetricsUsingField(fieldKey: string, allMetrics: MetricDef[]): MetricDef[] {
  const directRefs = new Set<string>();
  for (const m of allMetrics) {
    const keys = new Set<string>();
    collectFieldKeys(m.query, keys);
    if (keys.has(fieldKey)) directRefs.add(m.id);
  }
  if (directRefs.size === 0) return [];
  // Segunda pasada: cualquier métrica que referencie (vía metric_ref) a una
  // de las que usan el campo directamente, también depende de él.
  const affected = new Set(directRefs);
  let changed = true;
  while (changed) {
    changed = false;
    for (const m of allMetrics) {
      if (affected.has(m.id)) continue;
      const refs = new Set<string>();
      collectMetricRefs(m.query, refs);
      for (const r of refs) {
        if (affected.has(r)) {
          affected.add(m.id);
          changed = true;
          break;
        }
      }
    }
  }
  return allMetrics.filter((m) => affected.has(m.id));
}
