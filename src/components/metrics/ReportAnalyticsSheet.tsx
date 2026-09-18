import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { BarChart3 } from "lucide-react";
import { LIST_REPORT_ANALYTICS_URL, type ReportAnalytics } from "@/lib/financialReports";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  reportId: string | null;
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
export function ReportAnalyticsSheet({ open, onOpenChange, companyId, reportId }: Props) {
  const [data, setData] = useState<ReportAnalytics | null>(null);
  const [loading, setLoading] = useState(false);

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
          ) : !data || (data.by_fund.length === 0 && data.by_person.length === 0) ? (
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
