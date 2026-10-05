import { useEffect, useMemo, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { BarChart3 } from "lucide-react";
import { LIST_REPORT_ANALYTICS_URL, type ReportAnalytics } from "@/lib/financialReports";
import type { Connection } from "@/lib/connections";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  reportId: string | null;
  // ReportAnalyticsByFund solo trae fund_id (contrato 2026-09-11, sin
  // nombre) — se resuelve acá contra las conexiones ya cargadas por el
  // caller (counterpart_id de una conexión con counterpart_type "fund" es
  // el mismo id), nunca se inventa un nombre. Si un fondo se desconectó
  // después de que se registró la actividad, cae al fallback "Fondo
  // desconectado" en vez de mostrar el id crudo.
  connections?: Connection[];
};

function formatSeconds(s: number): string {
  const m = Math.floor(s / 60);
  const rem = s % 60;
  return m > 0 ? `${m}m ${rem}s` : `${rem}s`;
}

// Analítica real de lectura (contrato 2026-09-11) — reemplaza la vieja
// pregunta "¿lo revisó?" (sí/no) por algo accionable: cuántas veces lo
// abrió cada fondo, cuánto tiempo activo, y hasta dónde llegó (scroll_pct
// máximo), igual que un link de DocSend.
export function ReportAnalyticsSheet({ open, onOpenChange, companyId, reportId, connections = [] }: Props) {
  const [data, setData] = useState<ReportAnalytics | null>(null);
  const [loading, setLoading] = useState(false);

  const fundNameById = useMemo(
    () => Object.fromEntries(connections.filter((c) => c.counterpart_type === "fund").map((c) => [c.counterpart_id, c.counterpart_name])),
    [connections]
  );

  useEffect(() => {
    if (!open || !reportId || !companyId) return;
    setLoading(true);
    setData(null);
    const params = new URLSearchParams({ company_id: companyId, report_id: reportId });
    fetch(`${LIST_REPORT_ANALYTICS_URL}?${params.toString()}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, reportId, companyId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>Actividad de este reporte</SheetTitle>
          <SheetDescription>Quién lo abrió, cuánto tiempo pasó y hasta dónde llegó.</SheetDescription>
        </SheetHeader>
        <div className="mt-5 space-y-6">
          {loading ? (
            <LoadingState />
          ) : !data || (data.by_fund.length === 0 && data.by_person.length === 0 && (data.by_version ?? []).length === 0) ? (
            <EmptyState icon={BarChart3} title="Todavía no lo abrió nadie." description="En cuanto un inversor lo abra vas a ver su actividad acá." />
          ) : (
            <>
              <div className="grid grid-cols-2 gap-3">
                <div className="border border-border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Aperturas totales</div>
                  <div className="text-xl font-medium tabular-nums mt-1">{data.total_opens}</div>
                </div>
                <div className="border border-border rounded-lg p-3">
                  <div className="text-xs text-muted-foreground">Tiempo activo total</div>
                  <div className="text-xl font-medium tabular-nums mt-1">{formatSeconds(data.total_active_seconds)}</div>
                </div>
              </div>

              {(data.by_version ?? []).length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Por versión publicada</div>
                  <div className="border border-border rounded-lg divide-y divide-border">
                    {(data.by_version ?? []).map((v) => (
                      <div key={v.version} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                        <span>Versión {v.version}</span>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {v.opens} apertura{v.opens === 1 ? "" : "s"} · {formatSeconds(v.total_active_seconds)}
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.by_fund.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Por fondo</div>
                  <div className="border border-border rounded-lg divide-y divide-border">
                    {data.by_fund.map((f) => (
                      <div key={f.fund_id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                        <span className="truncate">{fundNameById[f.fund_id] ?? "Fondo desconectado"}</span>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {f.opens} apertura{f.opens === 1 ? "" : "s"} · {formatSeconds(f.active_seconds)} · {f.max_scroll_pct}% visto
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {data.by_person.length > 0 && (
                <div>
                  <div className="text-xs font-medium text-muted-foreground mb-2">Por persona</div>
                  <div className="border border-border rounded-lg divide-y divide-border">
                    {data.by_person.map((p) => (
                      <div key={p.viewer_user_id} className="flex items-center justify-between gap-3 px-3 py-2.5 text-sm">
                        <span className="truncate">{p.viewer_name}</span>
                        <span className="text-xs text-muted-foreground tabular-nums shrink-0">
                          {p.opens} apertura{p.opens === 1 ? "" : "s"} · {formatSeconds(p.active_seconds)} · {p.max_scroll_pct}% visto
                        </span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
        </div>
      </SheetContent>
    </Sheet>
  );
}
