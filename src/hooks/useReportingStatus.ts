import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { handleMembershipError } from "@/lib/membership";
import {
  LIST_REPORTING_STATUS_URL,
  MARK_REPORT_VIEWED_URL,
  MARK_REPORT_REVIEWED_URL,
  type ReportingStatusRow,
} from "@/lib/portfolioIntelligence";

async function fetchReportingStatus(period: string, companyIds?: string[], segmentId?: string): Promise<ReportingStatusRow[]> {
  const query = new URLSearchParams({ period });
  if (companyIds && companyIds.length > 0) query.set("company_ids", companyIds.join(","));
  if (segmentId) query.set("segment_id", segmentId);
  const res = await fetch(`${LIST_REPORTING_STATUS_URL}?${query.toString()}`, { credentials: "include" });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.rows) ? (data.rows as ReportingStatusRow[]) : [];
}

// needs_review se deriva en cada lectura, no es un flag que quede pegado:
// si el founder vuelve a compartir/editar el reporte después de una
// revisión, automáticamente vuelve a pedir revisión sin acción manual.
export function useReportingStatus(period: string, companyIds?: string[], segmentId?: string) {
  const key = [...(companyIds ?? [])].sort().join(",");
  const { data: rows = [], isLoading: loading } = useQuery({
    queryKey: ["reporting-status", period, key, segmentId ?? ""],
    queryFn: () => fetchReportingStatus(period, companyIds, segmentId),
  });
  return { rows, loading };
}

export function useReportingStatusMutations() {
  const queryClient = useQueryClient();
  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["reporting-status"] });

  // "Vi el reporte" — automático al abrir el visor, distinto de "lo
  // revisé" (acción deliberada). Llamar cada vez que se abre un reporte.
  const markViewed = async (reportId: string): Promise<void> => {
    try {
      await fetch(MARK_REPORT_VIEWED_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId }),
      });
      invalidate();
    } catch {
      // silencioso a propósito — no bloquear la lectura del reporte por
      // esto, es solo un timestamp de conveniencia.
    }
  };

  // reviewed:false deshace una revisión marcada por error — vuelve a pedir
  // revisión, no solo sirve para marcar.
  const markReviewed = async (reportId: string, reviewed: boolean): Promise<boolean> => {
    try {
      const res = await fetch(MARK_REPORT_REVIEWED_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ report_id: reportId, reviewed }),
      });
      if (await handleMembershipError(res)) return false;
      toast.success(reviewed ? "Marcado como revisado" : "Revisión deshecha");
      invalidate();
      return true;
    } catch {
      toast.error("No se pudo actualizar la revisión");
      return false;
    }
  };

  return { markViewed, markReviewed };
}
