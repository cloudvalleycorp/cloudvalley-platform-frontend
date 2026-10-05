import { describe, it, expect } from "vitest";
import type { MetricDef } from "@/lib/metrics";
import { buildHistoryPeriodStrs, QUERY_NO_DATA, resolveReportBlock } from "@/lib/reportBlockResolver";

const inputDef = { id: "m1", name: "Revenue", metric_type: "input", input_key: "revenue", unit: "$" } as unknown as MetricDef;
const queryDef = { id: "q1", name: "Churn", metric_type: "calculated", query: { any: true }, unit: "%" } as unknown as MetricDef;

const base = {
  currentInputs: { revenue: 1200 },
  prevInputs: { revenue: 1000 },
  historyInputs: [],
  currentPeriodStr: "2026-04",
  prevPeriodStr: "2026-03",
  historyPeriodStrs: ["2025-11", "2025-12", "2026-01", "2026-02", "2026-03", "2026-04"],
};

describe("resolveReportBlock", () => {
  it("un input calcula valor y variación contra el mes anterior", () => {
    const r = resolveReportBlock({ ...base, def: inputDef });
    expect(r.current).toBe(1200);
    expect(r.change).toBeCloseTo(20);
    expect(r.missing).toEqual([]);
  });

  it("un input sin dato queda como faltante, nunca como cero", () => {
    const r = resolveReportBlock({ ...base, currentInputs: {}, def: inputDef });
    expect(r.current).toBeNull();
    expect(r.missing).toEqual(["revenue"]);
  });

  it("sin base previa no hay variación (ni 0%)", () => {
    const r = resolveReportBlock({ ...base, prevInputs: { revenue: 0 }, def: inputDef });
    expect(r.change).toBeNull();
  });

  it("una métrica query-based sin evaluar informa que no hay datos suficientes", () => {
    const r = resolveReportBlock({ ...base, def: queryDef, evaluatedByPeriod: undefined });
    expect(r.current).toBeNull();
    expect(r.missing).toEqual([QUERY_NO_DATA]);
  });

  it("los meses sin dato del sparkline quedan en null, no en 0", () => {
    const r = resolveReportBlock({
      ...base,
      def: queryDef,
      evaluatedByPeriod: { "2026-04": 2, "2026-03": 1 },
    });
    expect(r.sparkData.map((p) => p.v)).toEqual([null, null, null, null, 1, 2]);
  });

  it("un input sin historial no inventa ceros en el sparkline", () => {
    const r = resolveReportBlock({
      ...base,
      def: inputDef,
      historyInputs: [{ revenue: 900 }, {}, { revenue: 1200 }],
    });
    expect(r.sparkData.map((p) => p.v)).toEqual([900, null, 1200]);
  });
});

describe("buildHistoryPeriodStrs", () => {
  it("devuelve seis meses terminando en el período pedido, del más viejo al actual", () => {
    expect(buildHistoryPeriodStrs({ month: 4, year: 2026 })).toEqual([
      "2025-11",
      "2025-12",
      "2026-01",
      "2026-02",
      "2026-03",
      "2026-04",
    ]);
  });
});
