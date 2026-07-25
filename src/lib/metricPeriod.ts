// Shared period-key helpers used by Growth Tracker (Metrics.tsx),
// useFinancialMetrics, and the read-only investor metrics view — kept in one
// place so the "y-m" key format used to index `entries` stays consistent
// everywhere.

export const periodKey = (m: number, y: number) => `${y}-${m}`;

export const prevMonth = (m: number, y: number) => (m === 1 ? { m: 12, y: y - 1 } : { m: m - 1, y });

export const toPeriodString = (m: number, y: number) => `${y}-${String(m).padStart(2, "0")}`;

export function parsePeriodString(period: string): { y: number; m: number } {
  const [y, m] = period.split("-").map(Number);
  return { y, m };
}
