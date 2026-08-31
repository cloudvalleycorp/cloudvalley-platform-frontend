// CAPA: similitud de nombre determinística, pura — complemento del dedup
// universal real de backend (upsert-metric-definition, 409 +
// pending_confirmation, ver useMetricPropertyForm.ts). Atrapa variantes de
// formato y substrings claros ("Revenue" ⊂ "Revenue USD" ⊂ "Total Revenue")
// ANTES de intentar guardar — útil sobre todo en SuggestedMetricsReview,
// donde una IA puede proponer varias métricas a la vez sin haber chequeado
// contra el catálogo existente. Nunca atrapa sinónimos entre idiomas ni
// palabras distintas para el mismo concepto ("Sales"/"Ingresos" vs.
// "Revenue") — eso requiere comprensión semántica real, que sí tiene el 409
// de backend (nombre multi-idioma + similitud estructural de query).
import type { MetricDef } from "@/lib/metrics";

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");

// Exportado además de usarse acá — RawFieldPicker.tsx lo reusa para el hint
// de "campo parecido en otra fuente" (mismo criterio de similitud, distinto
// dominio: columnas de planilla en vez de nombres de métrica).
export function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

export function findPossibleDuplicates(candidateName: string, existingMetrics: MetricDef[]): MetricDef[] {
  const candidate = normalize(candidateName);
  if (!candidate) return [];
  return existingMetrics.filter((m) => {
    const existing = normalize(m.name);
    if (!existing) return false;
    if (existing === candidate) return true;
    // Substring mutuo — "revenue" ⊂ "revenue usd", "total revenue" ⊃ "revenue".
    if (existing.includes(candidate) || candidate.includes(existing)) return true;
    return false;
  });
}
