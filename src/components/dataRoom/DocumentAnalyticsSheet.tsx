import { useEffect, useState } from "react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { BarChart3 } from "lucide-react";
import { LIST_DOCUMENT_ANALYTICS_URL, type DocumentAnalytics } from "@/lib/dataRoom";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  documentId: string | null;
};

// Calco de ReportAnalyticsSheet.tsx, sin tile de tiempo activo (el tracking
// de documentos v1 no manda active_seconds/scroll_pct — ver
// useDocumentViewTracking.ts y el plan).
export function DocumentAnalyticsSheet({ open, onOpenChange, companyId, documentId }: Props) {
  const [data, setData] = useState<DocumentAnalytics | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !documentId || !companyId) return;
    setLoading(true);
    setData(null);
    const params = new URLSearchParams({ company_id: companyId, document_id: documentId });
    fetch(`${LIST_DOCUMENT_ANALYTICS_URL}?${params.toString()}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((d) => setData(d))
      .catch(() => setData(null))
      .finally(() => setLoading(false));
  }, [open, documentId, companyId]);

  return (
    <Sheet open={open} onOpenChange={onOpenChange}>
      <SheetContent className="w-full sm:max-w-lg overflow-y-auto">
        <SheetHeader className="text-left">
          <SheetTitle>Actividad de este documento</SheetTitle>
          <SheetDescription>Quién lo abrió y quién lo descargó.</SheetDescription>
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
                  <div className="text-xs text-muted-foreground">Descargas totales</div>
                  <div className="text-xl font-medium tabular-nums mt-1">{data.total_downloads}</div>
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
                          {p.opens} apertura{p.opens === 1 ? "" : "s"} · {p.downloads} descarga{p.downloads === 1 ? "" : "s"}
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
