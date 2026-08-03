import { useMemo } from "react";
import type { InputsMap, MetricDef, PeriodInputs } from "@/lib/metrics";
import { periodKey, prevMonth, toPeriodString } from "@/lib/metricPeriod";

type Params = {
  metrics: MetricDef[]; // any category — filtered internally to inputs
  entries: Record<string, Record<string, number>>;
  period: { month: number; year: number };
};

// Shared by Metrics.tsx, ReportEditor.tsx, and InvestorCompany.tsx — each
// independently assembled the same current/previous/history input maps for
// a given period before this was pulled out. `rawFieldPeriods`/
// useRawFieldValues itself stays per-page (Metrics.tsx additionally needs
// the whole selected year for its annual grid; the other two don't), so this
// hook only returns the base set every consumer needs (current, previous,
// last 12 calendar months) for callers to extend if they need more.
export function useMetricReportData({ metrics, entries, period }: Params) {
  const allInputDefs = useMemo(() => metrics.filter((m) => m.metric_type === "input"), [metrics]);

  const inputsForPeriod = (m: number, y: number): InputsMap => {
    const result: InputsMap = {};
    const pk = periodKey(m, y);
    for (const def of allInputDefs) {
      if (!def.input_key) continue;
      const v = entries[def.id]?.[pk];
      if (v !== undefined) result[def.input_key] = v;
    }
    return result;
  };

  const currentInputs = inputsForPeriod(period.month, period.year);
  const prev = prevMonth(period.month, period.year);
  const prevInputs = inputsForPeriod(prev.m, prev.y);

  const historyInputs = useMemo(() => {
    const arr: InputsMap[] = [];
    let m = period.month, y = period.year;
    for (let i = 0; i < 6; i++) {
      arr.unshift(inputsForPeriod(m, y));
      const p = prevMonth(m, y);
      m = p.m;
      y = p.y;
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, period, allInputDefs]);

  // Ventana más ancha (24 meses) para SUMLAST/AVGLAST/YTD en fórmulas custom.
  const formulaHistory = useMemo(() => {
    const arr: PeriodInputs[] = [];
    let m = period.month, y = period.year;
    for (let i = 0; i < 24; i++) {
      arr.unshift({ month: m, year: y, values: inputsForPeriod(m, y) });
      const p = prevMonth(m, y);
      m = p.m;
      y = p.y;
    }
    return arr;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [entries, period, allInputDefs]);

  // Base raw-field periods every consumer needs: current, previous, and the
  // last 12 calendar months from today (MetricInfoSheet's history is always
  // "last 12 months from today", independent of the selected period).
  const baseRawFieldPeriods = useMemo(() => {
    const set = new Set<string>();
    set.add(toPeriodString(period.month, period.year));
    set.add(toPeriodString(prev.m, prev.y));
    const now = new Date();
    let m = now.getMonth() + 1;
    let y = now.getFullYear();
    for (let i = 0; i < 12; i++) {
      set.add(toPeriodString(m, y));
      const p = prevMonth(m, y);
      m = p.m;
      y = p.y;
    }
    return Array.from(set);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [period, prev.m, prev.y]);

  return { allInputDefs, inputsForPeriod, currentInputs, prevInputs, prev, historyInputs, formulaHistory, baseRawFieldPeriods };
}
