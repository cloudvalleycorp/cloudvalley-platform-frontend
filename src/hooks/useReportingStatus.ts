import { useQuery } from "@tanstack/react-query";
import { LIST_REPORTING_STATUS_URL, type ReportingStatusRow } from "@/lib/portfolioIntelligence";

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
