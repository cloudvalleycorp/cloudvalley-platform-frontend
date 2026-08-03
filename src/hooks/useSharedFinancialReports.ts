import { useEffect, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  LIST_SHARED_FINANCIAL_REPORTS_URL,
  GET_FINANCIAL_REPORT_URL,
  type SharedReportSummary,
  type ReportSection,
} from "@/lib/financialReports";

type ReportsResult = { reports: SharedReportSummary[]; forbidden: boolean };

async function fetchSharedReports(companyId: string): Promise<ReportsResult> {
  const res = await fetch(`${LIST_SHARED_FINANCIAL_REPORTS_URL}?company_id=${encodeURIComponent(companyId)}`, {
    credentials: "include",
  });
  if (res.status === 403) return { reports: [], forbidden: true };
  if (!res.ok) return { reports: [], forbidden: false };
  const data = await res.json();
  return { reports: Array.isArray(data?.reports) ? data.reports : [], forbidden: false };
}

type DetailResult = { sections: ReportSection[] | null; forbidden: boolean };

async function fetchReportDetail(reportId: string): Promise<DetailResult> {
  const res = await fetch(`${GET_FINANCIAL_REPORT_URL}?report_id=${encodeURIComponent(reportId)}`, {
    credentials: "include",
  });
  if (res.status === 403) return { sections: null, forbidden: true };
  if (!res.ok) return { sections: null, forbidden: false };
  const data = await res.json();
  return { sections: Array.isArray(data?.sections) ? data.sections : [], forbidden: false };
}

/**
 * Fund-side: which report(s) a company shared with the caller's connection,
 * plus the structure (sections/blocks) of whichever one is selected. Values
 * for the metrics referenced inside are resolved separately via
 * useConnectedCompanyMetrics (list-financial-metrics/list-financial-records),
 * unchanged by report-sharing.
 */
export function useSharedFinancialReports(companyId: string | null) {
  const { data: reportsData, isLoading: loadingReports } = useQuery({
    queryKey: ["shared-financial-reports", companyId],
    queryFn: () => fetchSharedReports(companyId!),
    enabled: !!companyId,
  });
  const reports = reportsData?.reports ?? [];

  const [selectedId, setSelectedId] = useState<string | null>(null);

  // Reset on company change, then auto-pick the first report once it loads
  // — but only while nothing is selected yet, so a background refetch (e.g.
  // window refocus) doesn't clobber the caller's manual pick from the
  // report dropdown.
  useEffect(() => {
    setSelectedId(null);
  }, [companyId]);

  useEffect(() => {
    if (reportsData && selectedId === null) {
      setSelectedId(reportsData.reports[0]?.report_id ?? null);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [reportsData]);

  const { data: detailData, isLoading: loadingDetail } = useQuery({
    queryKey: ["financial-report-detail", selectedId],
    queryFn: () => fetchReportDetail(selectedId!),
    enabled: !!selectedId,
  });

  return {
    reports,
    loadingReports,
    selectedId,
    setSelectedId,
    sections: detailData?.sections ?? null,
    loadingDetail,
    forbidden: (reportsData?.forbidden ?? false) || (detailData?.forbidden ?? false),
  };
}
