import { AlertCircle, CheckCircle2 } from "lucide-react";
import { groupRowErrors, type ImportLogEntry } from "@/lib/financialData";

export function ImportLogTable({ logs, emptyLabel }: { logs: ImportLogEntry[]; emptyLabel: string }) {
  if (logs.length === 0) {
    return <div className="border border-border rounded-lg p-8 text-center text-sm text-muted-foreground bg-card">{emptyLabel}</div>;
  }
  return (
    <div className="space-y-2">
      {logs.map((log) => {
        const failed = log.status === "error" || (log.rows_processed === 0 && log.rows_rejected > 0);
        const hasErrors = log.rows_rejected > 0;
        const grouped = groupRowErrors(log.row_errors);
        return (
          <div
            key={log.import_log_id}
            className={`border rounded-lg p-4 bg-card ${failed ? "border-destructive/40" : "border-border"}`}
          >
            <div className="flex items-start justify-between gap-4">
              <div className="min-w-0">
                <div className="flex items-center gap-2 flex-wrap">
                  <span className="font-medium">{log.period}</span>
                  <span className="text-xs text-muted-foreground uppercase tracking-wide">{log.source_type}</span>
                </div>
                <div className="text-xs text-muted-foreground mt-1">
                  {new Date(log.started_at).toLocaleString("es-AR")} · {log.triggered_by}
                </div>
              </div>
              <span
                className={`inline-flex items-center gap-1 text-xs shrink-0 ${hasErrors ? "text-destructive" : "text-muted-foreground"}`}
              >
                {hasErrors ? <AlertCircle size={12} strokeWidth={1.5} /> : <CheckCircle2 size={12} strokeWidth={1.5} />}
                {failed
                  ? "No se pudo procesar nada"
                  : `${log.rows_processed} guardado${log.rows_processed === 1 ? "" : "s"}`}
                {hasErrors && !failed && ` · ${log.rows_rejected} rechazado${log.rows_rejected === 1 ? "" : "s"}`}
              </span>
            </div>
            {grouped.length > 0 && (
              <ul className="mt-3 pt-3 border-t border-border/50 space-y-1.5">
                {grouped.map((g, i) => (
                  <li key={i} className="text-xs text-destructive">
                    <span className="font-medium">{g.field}</span>: {g.reason}
                    {g.count > 1 && (
                      <span className="text-muted-foreground">
                        {" "}
                        (afecta {g.count} fila{g.count === 1 ? "" : "s"}
                        {g.rows.length > 0 && `, ej. ${g.rows.join(", ")}${g.count > g.rows.length ? "…" : ""}`})
                      </span>
                    )}
                    {g.count === 1 && g.rows.length > 0 && (
                      <span className="text-muted-foreground"> (fila {g.rows[0]})</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </div>
        );
      })}
    </div>
  );
}
