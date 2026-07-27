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

/**
 * Shared by useFinancialMetrics, useConnectedCompanyMetrics, and the report
 * preview: turns list-records' flat { period, ...fields } rows into the
 * { metric_id: { "y-m": value } } shape every metrics view indexes against.
 * Fields absent or null are skipped identically (no invented 0s).
 */
export function buildEntriesFromRecords(
  inputDefs: { id: string; input_key: string | null }[],
  records: Record<string, unknown>[]
): Record<string, Record<string, number>> {
  const entries: Record<string, Record<string, number>> = {};
  for (const def of inputDefs) {
    if (!def.input_key) continue;
    for (const rec of records) {
      const v = rec[def.input_key];
      const period = rec.period;
      if (typeof v !== "number" || typeof period !== "string") continue;
      const { y, m } = parsePeriodString(period);
      entries[def.id] ??= {};
      entries[def.id][periodKey(m, y)] = v;
    }
  }
  return entries;
}
