import { describe, expect, it } from "vitest";
import { evaluateMetric, metricDisplay } from "./metricEvaluation";
import { initialRecords, type RecordItem } from "./model";
import { applySourcePreview, previewSource } from "./sourceSimulation";
import type { AggregationNode, QuerySpec } from "@/lib/querySpec";

const source = initialRecords.find(r => r.id === "eerr")!;
const imported = applySourcePreview(source, previewSource(source));
const sum: AggregationNode = { type: "aggregation", aggregation: "sum", field_key: "ingresos", distinct_field_key: null, filters: [] };
const metric = (query: QuerySpec, id = "revenue"): RecordItem => ({ id, area: "metrics", name: id, value: "obsolete", category: "Ingresos", status: "Al día", detail: "", fields: { metric_type: "calculated", value_type: "money", currency: "USD" }, query });
describe("demo metric calculations", () => {
  it("uses imported values and returns their source instead of stale snapshots", () => {
    const item = metric(sum);
    expect(evaluateMetric(item, [imported])).toEqual({ value: 101000, sources: [source.id] });
    expect(metricDisplay(item, [imported])).toBe("USD 101.000");
    expect(evaluateMetric(item, [source]).reason).toContain("No hay datos importados");
    expect(evaluateMetric(item, [imported], "2026-08", "forecast").value).toBeUndefined();
  });
  it("distinguishes rolling, all-time and shifted periods", () => {
    expect(evaluateMetric(metric({ ...sum, window: { months: 2 } }), [imported]).value).toBe(191000);
    expect(evaluateMetric(metric({ ...sum, window: { months: null } }), [imported]).value).toBe(271000);
    const revenue = metric(sum);
    const previous = metric({ type: "metric_ref", metric_id: revenue.id, period_offset: -1 }, "previous");
    expect(evaluateMetric(previous, [imported, revenue]).value).toBe(90000);
  });
  it("filters numeric values, counts distinct values and distinguishes zero from missing data", () => {
    const query: AggregationNode = { ...sum, window: { months: null }, filters: [{ field_key: "costos", operator: ">=", value: 26000 }] };
    expect(evaluateMetric(metric(query), [imported]).value).toBe(191000);
    expect(evaluateMetric(metric({ ...query, aggregation: "count_distinct", distinct_field_key: "costos" }), [imported]).value).toBe(2);
    expect(evaluateMetric(metric({ ...query, filters: [{ field_key: "costos", operator: ">", value: 999999 }] }), [imported]).value).toBe(0);
    expect(evaluateMetric(metric(sum), [imported], "2027-01").value).toBeUndefined();
  });
  it("rejects cycles, zero divisors and formatted snapshots as arithmetic operands", () => {
    const a = metric({ type: "metric_ref", metric_id: "b" }, "a");
    const b = metric({ type: "metric_ref", metric_id: "a" }, "b");
    expect(evaluateMetric(a, [a, b]).reason).toContain("circulares");
    expect(evaluateMetric(metric({ type: "arithmetic", operator: "/", left: sum, right: { type: "constant", value: 0 } }), [imported]).reason).toContain("cero");
    expect(evaluateMetric(metric({ type: "arithmetic", operator: "*", left: { type: "metric_ref", metric_id: "mrr" }, right: { type: "constant", value: 12 } }), initialRecords).reason).toContain("numérico");
  });
  it("keeps scenario entries separate and recalculates after source changes", () => {
    const input: RecordItem = { ...metric(sum), query: null, entries: { "2026-08:actual": "12", "2026-08:budget": "25" } };
    expect(evaluateMetric(input, [], "2026-08", "budget").value).toBe(25);
    const changed = { ...imported, sourceRows: [{ period: "2026-08", values: { ingresos: "42" } }] };
    expect(evaluateMetric(metric(sum), [changed]).value).toBe(42);
    expect(evaluateMetric(metric(sum), [imported]).value).toBe(101000);
  });
});
