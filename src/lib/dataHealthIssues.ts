// CAPA: agregación de salud de datos — combina señales 100% reales de dos
// orígenes: (a) lo que el cliente ya tiene cargado y puede derivar sin red
// (cuentas que perdieron acceso, errores del último sync, conexiones
// desactualizadas por timestamp real, métricas huérfanas, conflictos de
// standard_key, campos mapeados sin usar) y (b) list-data-health-issues del
// backend (mapeos de baja confianza, anomalías estadísticas). Puro
// determinístico salvo por el paso (b), que ya viene resuelto — esta función
// no llama IA ni inventa nada, solo junta y prioriza.
import type { GoogleAccount, SheetConnection } from "@/lib/sheetsIntegration";
import type { MetricDef, RawField } from "@/lib/metrics";
import type { ImportLogEntry, MetricClassWarning } from "@/lib/financialData";
import type { DataHealthIssue as BackendHealthIssue } from "@/lib/metricIntelligence";
import { computeFreshness } from "@/lib/dataFreshness";
import { resolveMetricSources } from "@/lib/metricLineage";

export type HealthIssueSeverity = "critical" | "warning" | "info";

export type HealthIssue = {
  id: string;
  severity: HealthIssueSeverity;
  category: string;
  title: string;
  description: string;
  // Adónde ir para resolver este issue puntual — ausente solo cuando no hay
  // un destino más específico que "Salud de datos" en sí (hoy ningún caso).
  // Encontrado en vivo 2026-09-03: la lista mostraba "X no está conectada a
  // ninguna fuente" sin ningún link, el founder no tenía forma de llegar
  // desde acá a arreglarlo — tenía que ir a buscar la métrica a mano en el
  // Explorador.
  targetPath?: string;
};

export type HealthSummary = { critical: number; warning: number; info: number; total: number };

export function summarizeHealth(issues: HealthIssue[]): HealthSummary {
  const summary = { critical: 0, warning: 0, info: 0, total: issues.length };
  for (const i of issues) summary[i.severity]++;
  return summary;
}

export function collectDataHealthIssues(input: {
  accounts: GoogleAccount[];
  connections: SheetConnection[];
  metrics: MetricDef[];
  importLogs: ImportLogEntry[];
  rawFields: RawField[];
  warnings: MetricClassWarning[];
  backendIssues: BackendHealthIssue[];
}): HealthIssue[] {
  const { accounts, connections, metrics, importLogs, rawFields, warnings, backendIssues } = input;
  const issues: HealthIssue[] = [];

  for (const acc of accounts) {
    if (acc.reconnect_required) {
      issues.push({
        id: `reconnect-${acc.account_id}`,
        severity: "critical",
        category: "Permisos",
        title: `Se perdió el acceso a ${acc.google_account_email}`,
        description: "Reconectá esta cuenta para seguir sincronizando sus hojas.",
        targetPath: "/growth-tracker/sheets",
      });
    }
  }

  for (const conn of connections) {
    const { label, ageDays } = computeFreshness(conn.last_synced_at);
    if (label === "critical" || label === "stale") {
      issues.push({
        id: `stale-${conn.connection_id}`,
        severity: label === "critical" ? "critical" : "warning",
        category: "Frescura",
        title: `${conn.spreadsheet_name} · ${conn.sheet_name} está desactualizada`,
        description: ageDays != null ? `Última sincronización hace ${Math.floor(ageDays)} día${Math.floor(ageDays) === 1 ? "" : "s"}.` : "Nunca se sincronizó.",
        targetPath: `/growth-tracker/sheets?connection_id=${encodeURIComponent(conn.connection_id)}`,
      });
    }
    if (conn.last_sync_status && conn.last_sync_status !== "success") {
      issues.push({
        id: `sync-error-${conn.connection_id}`,
        severity: "warning",
        category: "Sincronización",
        title: `${conn.spreadsheet_name} · ${conn.sheet_name} tuvo un error de sync`,
        description: `Último estado: ${conn.last_sync_status}.`,
        targetPath: `/growth-tracker/sheets?connection_id=${encodeURIComponent(conn.connection_id)}`,
      });
    }
  }

  for (const log of importLogs) {
    if (log.rows_rejected > 0) {
      issues.push({
        id: `rejected-${log.import_log_id}`,
        severity: "warning",
        category: "Calidad de datos",
        title: `${log.rows_rejected} fila${log.rows_rejected === 1 ? "" : "s"} rechazada${log.rows_rejected === 1 ? "" : "s"}`,
        description: `Período ${log.period}, fuente ${log.source_type}.`,
        targetPath: "/growth-tracker/sheets",
      });
    }
  }

  const ownMetrics = metrics.filter((m) => m.metric_type === "calculated");
  for (const m of ownMetrics) {
    const sources = resolveMetricSources(m, metrics, rawFields);
    if (sources.length === 0 && m.query) {
      issues.push({
        id: `orphan-${m.id}`,
        severity: "info",
        category: "Métricas sin fuente",
        title: `"${m.name}" no está conectada a ninguna fuente de datos`,
        description: "Su fórmula no referencia ningún campo mapeado todavía.",
        targetPath: `/metrics/${encodeURIComponent(m.id)}`,
      });
    }
  }

  const unusedFields = rawFields.filter((f) => !metrics.some((m) => metricReferencesField(m, f.field_key)));
  if (unusedFields.length > 0) {
    issues.push({
      id: "unused-fields",
      severity: "info",
      category: "Campos sin usar",
      title: `${unusedFields.length} campo${unusedFields.length === 1 ? "" : "s"} mapeado${unusedFields.length === 1 ? "" : "s"} sin usar en ninguna métrica`,
      description: unusedFields.slice(0, 5).map((f) => f.field_key).join(", ") + (unusedFields.length > 5 ? "…" : ""),
      targetPath: "/metrics?tab=sources",
    });
  }

  for (const w of warnings) {
    const names = w.metric_ids.map((id) => metrics.find((m) => m.id === id)?.name ?? id).join(" vs. ");
    issues.push({
      id: `conflict-${w.standard_key}`,
      severity: "warning",
      category: "Conflicto de métrica",
      title: `${w.count} métricas miden lo mismo (${w.standard_key})`,
      description: `${names}. Asigná un rol de fuente para elegir cuál usar, o revisá por qué difieren.`,
      targetPath: "/metrics",
    });
  }

  for (const bi of backendIssues) {
    if (bi.type === "low_confidence_mapping") {
      issues.push({
        id: `low-confidence-${bi.connection_id}-${bi.field_key}`,
        severity: "info",
        category: "Mapeo con baja confianza",
        title: `La columna "${bi.column}" quedó mapeada con baja confianza`,
        description: bi.confidence.basis,
        targetPath: `/growth-tracker/sheets?connection_id=${encodeURIComponent(bi.connection_id)}`,
      });
    } else {
      issues.push({
        id: `anomaly-${bi.connection_id}-${bi.field_key}-${bi.period}-${bi.row_number}`,
        severity: "warning",
        category: "Anomalía estadística",
        title: `Valor atípico en ${bi.field_key} (${bi.period})`,
        description: `${bi.value} — se esperaba algo cercano a ${bi.expected_range.mean.toFixed(1)}.`,
        targetPath: `/growth-tracker/sheets?connection_id=${encodeURIComponent(bi.connection_id)}`,
      });
    }
  }

  const order: Record<HealthIssueSeverity, number> = { critical: 0, warning: 1, info: 2 };
  return issues.sort((a, b) => order[a.severity] - order[b.severity]);
}

function metricReferencesField(metric: MetricDef, fieldKey: string): boolean {
  const query = metric.query;
  if (!query) return false;
  const stack = [query];
  while (stack.length > 0) {
    const q = stack.pop()!;
    if (q.type === "aggregation") {
      if (q.field_key === fieldKey || q.distinct_field_key === fieldKey) return true;
      if (q.filters.some((f) => f.field_key === fieldKey)) return true;
    } else if (q.type === "arithmetic") {
      stack.push(q.left, q.right);
    }
  }
  return false;
}
