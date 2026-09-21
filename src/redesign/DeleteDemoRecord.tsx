import { useState } from "react";
import { Button } from "@/components/ui/button";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import type { QuerySpec } from "@/lib/querySpec";
import type { RecordItem } from "./model";
import { sourceMappings } from "./sourceSimulation";

function affectedMetrics(source: RecordItem, records: RecordItem[]): RecordItem[] {
  const keys = new Set([...sourceMappings(source).map(mapping => mapping.key), ...(source.sourceRows || []).flatMap(row => Object.keys(row.values))]);
  const affected = new Set<string>();
  const uses = (query?: QuerySpec | null): boolean => !query ? false : query.type === "aggregation" ? [query.field_key, query.distinct_field_key, ...query.filters.map(filter => filter.field_key)].some(key => key && keys.has(key)) || query.aggregation === "count" : query.type === "metric_ref" ? affected.has(query.metric_id) : query.type === "arithmetic" ? uses(query.left) || uses(query.right) : false;
  let changed = true;
  while (changed) { changed = false; records.filter(record => record.area === "metrics" && !affected.has(record.id)).forEach(record => { if (record.fields?.source_connection_id === source.id || uses(record.query)) { affected.add(record.id); changed = true; } }); }
  return records.filter(record => affected.has(record.id));
}

export function DeleteDemoRecord({ item, records, onDelete }: { item: RecordItem; records: RecordItem[]; onDelete: (item: RecordItem) => Promise<void> }) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const source = item.area === "sources";
  const label = source ? "Eliminar fuente" : "Eliminar reporte";
  const affected = source ? affectedMetrics(item, records) : [];
  const remove = async () => { setBusy(true); setError(""); try { await onDelete(item); setOpen(false); } catch { setError("No se pudo eliminar. Volvé a intentarlo."); } finally { setBusy(false); } };
  return <div className="rd-mapped-form"><Button variant="ghost" className="text-destructive" onClick={() => { setError(""); setOpen(true); }}>{label}</Button>
    <ConfirmationDialog open={open} onOpenChange={value => !busy && setOpen(value)} title={`${label}: ${item.name}`} variant="destructive" confirmLabel={label} busy={busy} onConfirm={remove} description={<>
      {source ? "Se eliminarán el mapeo, los datos importados y el historial de esta fuente en la demo. Las consultas que usan sus campos pueden quedar sin datos. La cuenta conectada se conserva." : "Se eliminarán el reporte, su borrador y sus accesos compartidos en la demo. Las métricas originales se conservan. Las tareas que dependan de este reporte volverán a evaluarse."}
      {affected.length > 0 && <span className="block mt-3">Métricas que pueden verse afectadas: {affected.map(metric => metric.name).join(", ")}.</span>}
      <span className="block mt-3">Esta acción no se puede deshacer.</span>{error && <span role="alert" className="block mt-3 text-destructive">{error}</span>}
    </>} />
  </div>;
}
