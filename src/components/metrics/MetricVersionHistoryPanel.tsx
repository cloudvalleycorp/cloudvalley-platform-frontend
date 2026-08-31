import { useEffect, useState } from "react";
import { History } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { handleMembershipError } from "@/lib/membership";
import { DIFF_METRIC_VERSION_URL, type MetricVersionSummary, type DiffMetricVersionResponse } from "@/lib/metricIntelligence";
import type { MetricDef } from "@/lib/metrics";

type Props = {
  metric: MetricDef;
  companyId: string | null;
};

function fmt(v: unknown): string {
  if (v === null || v === undefined) return "—";
  if (typeof v === "object") return JSON.stringify(v);
  return String(v);
}

// Historial de cambios en la DEFINICIÓN de una métrica (nombre, query,
// currency, etc.) — NO versiona los datos crudos que la alimentan (fuera de
// alcance según el propio backend, ver diff-metric-version en el handoff).
// Un solo endpoint hace las dos cosas: sin from/to lista versiones, con
// from+to devuelve el diff — se llama primero sin parámetros para poblar el
// selector, y de nuevo con ambos elegidos.
export function MetricVersionHistoryPanel({ metric, companyId }: Props) {
  const [versions, setVersions] = useState<MetricVersionSummary[] | null>(null);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [fromId, setFromId] = useState<string>("");
  const [toId, setToId] = useState<string>("");
  const [diff, setDiff] = useState<DiffMetricVersionResponse | "loading" | "error" | null>(null);

  useEffect(() => {
    setVersions(null);
    setFromId("");
    setToId("");
    setDiff(null);
    if (!companyId) return;
    setLoadingVersions(true);
    fetch(`${DIFF_METRIC_VERSION_URL}?company_id=${encodeURIComponent(companyId)}&metric_id=${encodeURIComponent(metric.id)}`, {
      credentials: "include",
    })
      .then(async (res) => {
        if (await handleMembershipError(res)) return null;
        return res.ok ? res.json() : null;
      })
      .then((data) => {
        const list: MetricVersionSummary[] = Array.isArray(data?.versions) ? data.versions : [];
        list.sort((a, b) => (b.created_at ?? "").localeCompare(a.created_at ?? ""));
        setVersions(list);
      })
      .catch(() => setVersions([]))
      .finally(() => setLoadingVersions(false));
  }, [companyId, metric.id]);

  useEffect(() => {
    setDiff(null);
    if (!companyId || !fromId || !toId) return;
    setDiff("loading");
    fetch(
      `${DIFF_METRIC_VERSION_URL}?company_id=${encodeURIComponent(companyId)}&metric_id=${encodeURIComponent(metric.id)}&from=${encodeURIComponent(fromId)}&to=${encodeURIComponent(toId)}`,
      { credentials: "include" }
    )
      .then(async (res) => {
        if (await handleMembershipError(res)) return null;
        return res.ok ? ((await res.json()) as DiffMetricVersionResponse) : null;
      })
      .then((data) => setDiff(data ?? "error"))
      .catch(() => setDiff("error"));
  }, [companyId, metric.id, fromId, toId]);

  if (loadingVersions) return null;
  if (!versions || versions.length < 2) return null;

  return (
    <div>
      <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2 flex items-center gap-1.5">
        <History size={12} strokeWidth={1.5} /> Historial de cambios
      </h4>
      <div className="flex items-center gap-2 mb-2">
        <Select value={fromId} onValueChange={setFromId}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder="Versión anterior…" />
          </SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v.version_id} value={v.version_id}>
                {v.created_at ? new Date(v.created_at).toLocaleString("es-AR") : v.version_id}
                {v.deleted ? " (borrado)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <span className="text-xs text-muted-foreground">vs.</span>
        <Select value={toId} onValueChange={setToId}>
          <SelectTrigger className="h-8 text-xs flex-1">
            <SelectValue placeholder="Versión nueva…" />
          </SelectTrigger>
          <SelectContent>
            {versions.map((v) => (
              <SelectItem key={v.version_id} value={v.version_id}>
                {v.created_at ? new Date(v.created_at).toLocaleString("es-AR") : v.version_id}
                {v.deleted ? " (borrado)" : ""}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      {diff === "loading" && <p className="text-xs text-muted-foreground">Comparando…</p>}
      {diff === "error" && <p className="text-xs text-muted-foreground">No se pudo comparar esas dos versiones.</p>}
      {diff && diff !== "loading" && diff !== "error" && (
        Object.keys(diff.changed_fields).length === 0 ? (
          <p className="text-xs text-muted-foreground">Sin cambios entre estas dos versiones.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-xs">
              <thead>
                <tr className="text-left text-muted-foreground">
                  <th className="pr-3 py-1">Campo</th>
                  <th className="pr-3 py-1">Antes</th>
                  <th className="pr-3 py-1">Después</th>
                </tr>
              </thead>
              <tbody>
                {Object.entries(diff.changed_fields).map(([field, change]) => (
                  <tr key={field} className="border-t border-border/50">
                    <td className="pr-3 py-1 font-mono">{field}</td>
                    <td className="pr-3 py-1 text-muted-foreground">{fmt(change.from)}</td>
                    <td className="pr-3 py-1">{fmt(change.to)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}
    </div>
  );
}
