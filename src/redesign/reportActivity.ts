import type { ReportAnalytics } from "@/lib/financialReports";
export type DemoRead = { fundId: string; fundName: string; at: string; seconds: number; scroll: number };
export const reportActivityKey = (id: string) => `cloudvalley-redesign-activity-${id}`;
export function readReportActivity(id: string): DemoRead[] {
  try { const value = JSON.parse(localStorage.getItem(reportActivityKey(id)) || "[]"); return Array.isArray(value) ? value.filter(row => typeof row.fundId === "string" && typeof row.fundName === "string" && typeof row.at === "string" && Number.isFinite(row.seconds) && row.seconds >= 0 && Number.isFinite(row.scroll) && row.scroll >= 0 && row.scroll <= 100) : []; } catch { return []; }
}
export function reportAnalytics(id: string, rows = readReportActivity(id)): ReportAnalytics {
  const ids = [...new Set(rows.map(row => row.fundId))];
  return { report_id: id, total_opens: rows.length, total_active_seconds: rows.reduce((sum, row) => sum + row.seconds, 0), by_person: [], by_fund: ids.map(fund_id => { const visits = rows.filter(row => row.fundId === fund_id); return { fund_id, opens: visits.length, active_seconds: visits.reduce((sum, row) => sum + row.seconds, 0), max_scroll_pct: Math.max(...visits.map(row => row.scroll)) }; }) };
}
