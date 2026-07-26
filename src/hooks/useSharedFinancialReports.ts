import { useEffect, useState } from "react";
import {
  LIST_SHARED_FINANCIAL_REPORTS_URL,
  GET_FINANCIAL_REPORT_URL,
  type SharedReportSummary,
  type ReportSection,
} from "@/lib/financialReports";

/**
 * Fund-side: which report(s) a company shared with the caller's connection,
 * plus the structure (sections/blocks) of whichever one is selected. Values
 * for the metrics referenced inside are resolved separately via
 * useConnectedCompanyMetrics (list-financial-metrics/list-financial-records),
 * unchanged by report-sharing.
 */
export function useSharedFinancialReports(companyId: string | null) {
  const [reports, setReports] = useState<SharedReportSummary[]>([]);
  const [loadingReports, setLoadingReports] = useState(true);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [sections, setSections] = useState<ReportSection[] | null>(null);
  const [loadingDetail, setLoadingDetail] = useState(false);

  useEffect(() => {
    if (!companyId) {
      setReports([]);
      setSelectedId(null);
      setLoadingReports(false);
      return;
    }
    setLoadingReports(true);
    (async () => {
      try {
        const res = await fetch(`${LIST_SHARED_FINANCIAL_REPORTS_URL}?company_id=${encodeURIComponent(companyId)}`, {
          credentials: "include",
        });
        if (!res.ok) {
          setReports([]);
          setSelectedId(null);
          return;
        }
        const data = await res.json();
        const list: SharedReportSummary[] = Array.isArray(data?.reports) ? data.reports : [];
        setReports(list);
        setSelectedId(list[0]?.report_id ?? null);
      } catch {
        setReports([]);
        setSelectedId(null);
      } finally {
        setLoadingReports(false);
      }
    })();
  }, [companyId]);

  useEffect(() => {
    if (!selectedId) {
      setSections(null);
      return;
    }
    setLoadingDetail(true);
    (async () => {
      try {
        const res = await fetch(`${GET_FINANCIAL_REPORT_URL}?report_id=${encodeURIComponent(selectedId)}`, {
          credentials: "include",
        });
        if (!res.ok) {
          setSections(null);
          return;
        }
        const data = await res.json();
        setSections(Array.isArray(data?.sections) ? data.sections : []);
      } catch {
        setSections(null);
      } finally {
        setLoadingDetail(false);
      }
    })();
  }, [selectedId]);

  return { reports, loadingReports, selectedId, setSelectedId, sections, loadingDetail };
}
