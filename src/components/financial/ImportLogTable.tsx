import { AlertCircle, CheckCircle2 } from "lucide-react";
import type { ImportLogEntry } from "@/lib/financialData";

export function ImportLogTable({ logs, emptyLabel }: { logs: ImportLogEntry[]; emptyLabel: string }) {
  if (logs.length === 0) {
    return <div className="border border-border rounded-lg p-8 text-center text-sm text-muted-foreground bg-card">{emptyLabel}</div>;
  }
  return (
    <div className="space-y-2">
      {logs.map((log) => {
        const hasErrors = log.rows_rejected > 0;
        return (
          <div key={log.import_log_id} className="border border-border rounded-lg p-4 bg-card">
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
                {log.rows_processed} guardado{log.rows_processed === 1 ? "" : "s"}
                {hasErrors && ` · ${log.rows_rejected} rechazado${log.rows_rejected === 1 ? "" : "s"}`}
              </span>
            </div>
            {log.row_errors.length > 0 && (
              <ul className="mt-3 pt-3 border-t border-border/50 space-y-1">
                {log.row_errors.map((e, i) => (
                  <li key={i} className="text-xs text-destructive">
                    {(e.row !== undefined || e.period) && (
                      <span className="text-muted-foreground">
                        {e.row !== undefined ? `Fila ${e.row}` : ""}
                        {e.row !== undefined && e.period ? " · " : ""}
                        {e.period ?? ""}
                        {": "}
                      </span>
                    )}
                    <span className="font-medium">{e.field}</span>: {e.reason}
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
