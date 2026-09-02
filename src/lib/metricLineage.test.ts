import { describe, it, expect } from "vitest";
import { resolveMetricSources, resolveMetricSourceLeaves, findMetricsUsingField } from "@/lib/metricLineage";
import {
  RAW_FIELDS,
  ALL_METRICS,
  METRIC_SINGLE_SOURCE,
  METRIC_MULTI_SOURCE,
  METRIC_ORPHAN,
  METRIC_DERIVED,
  METRIC_CIRCULAR_A,
  CONNECTION_SHEET,
  CONNECTION_EXCEL,
} from "@/test/fixtures/metrics";

describe("resolveMetricSources", () => {
  it("resuelve una métrica de una sola fuente a esa única conexión", () => {
    const sources = resolveMetricSources(METRIC_SINGLE_SOURCE, ALL_METRICS, RAW_FIELDS);
    expect(sources).toHaveLength(1);
    expect(sources[0].connectionId).toBe(CONNECTION_SHEET);
  });

  it("resuelve una métrica multi-fuente a las 2 conexiones reales, sin duplicar", () => {
    const sources = resolveMetricSources(METRIC_MULTI_SOURCE, ALL_METRICS, RAW_FIELDS);
    const ids = sources.map((s) => s.connectionId).sort();
    expect(ids).toEqual([CONNECTION_EXCEL, CONNECTION_SHEET].sort());
  });

  it("una métrica huérfana (field_key inexistente) resuelve a ninguna fuente", () => {
    expect(resolveMetricSources(METRIC_ORPHAN, ALL_METRICS, RAW_FIELDS)).toEqual([]);
  });

  it("sigue metric_ref recursivamente (Gross Margin = Revenue - COGS)", () => {
    const sources = resolveMetricSources(METRIC_DERIVED, ALL_METRICS, RAW_FIELDS);
    expect(sources.length).toBeGreaterThan(0);
    expect(sources.every((s) => s.connectionId === CONNECTION_SHEET)).toBe(true);
  });

  it("no entra en loop infinito con dos métricas que se referencian circularmente", () => {
    const sources = resolveMetricSources(METRIC_CIRCULAR_A, ALL_METRICS, RAW_FIELDS);
    expect(sources).toEqual([]);
  });
});

describe("resolveMetricSourceLeaves", () => {
  it("preserva cada hoja individual (no colapsa por conexión) para una métrica multi-fuente", () => {
    const leaves = resolveMetricSourceLeaves(METRIC_MULTI_SOURCE, ALL_METRICS, RAW_FIELDS);
    expect(leaves).toHaveLength(2);
    expect(leaves.every((l) => l.kind === "aggregation")).toBe(true);
  });

  it("una métrica input referenciada aparece como hoja 'input', no se expande más", () => {
    const leaves = resolveMetricSourceLeaves(
      { ...METRIC_SINGLE_SOURCE, id: "metric-with-input-ref", query: { type: "metric_ref", metric_id: "metric-input-nps" } },
      ALL_METRICS,
      RAW_FIELDS
    );
    expect(leaves).toEqual([{ kind: "input", metricId: "metric-input-nps", metricName: "NPS" }]);
  });

  it("no entra en loop infinito con referencias circulares", () => {
    expect(resolveMetricSourceLeaves(METRIC_CIRCULAR_A, ALL_METRICS, RAW_FIELDS)).toEqual([]);
  });
});

describe("findMetricsUsingField", () => {
  it("encuentra las métricas que usan un field_key directamente", () => {
    const affected = findMetricsUsingField("monto_total", ALL_METRICS);
    const ids = affected.map((m) => m.id);
    expect(ids).toContain(METRIC_SINGLE_SOURCE.id);
    expect(ids).toContain(METRIC_MULTI_SOURCE.id);
  });

  it("propaga la dependencia a través de metric_ref (romper el field rompe también a Gross Margin)", () => {
    const affected = findMetricsUsingField("monto_total", ALL_METRICS);
    expect(affected.map((m) => m.id)).toContain(METRIC_DERIVED.id);
  });

  it("un field_key que ninguna métrica usa devuelve un array vacío", () => {
    expect(findMetricsUsingField("field_key_que_nadie_usa", ALL_METRICS)).toEqual([]);
  });
});
