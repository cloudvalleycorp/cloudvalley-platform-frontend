import { describe, it, expect } from "vitest";
import { validateQuery, findRangeConflicts, summarizeQuery, blankAggregationNode, wrapInArithmetic, type QuerySpec } from "@/lib/querySpec";

describe("validateQuery", () => {
  it("una query null pide definir la consulta", () => {
    expect(validateQuery(null)).toEqual([{ path: "raíz", message: "Definí la consulta de la métrica." }]);
  });

  it("una agregación sum sin field_key es inválida", () => {
    const issues = validateQuery(blankAggregationNode());
    expect(issues).toHaveLength(1);
    expect(issues[0].message).toMatch(/Falta elegir el campo/);
  });

  it("una agregación sum con field_key es válida", () => {
    const q: QuerySpec = { type: "aggregation", aggregation: "sum", field_key: "monto", distinct_field_key: null, filters: [] };
    expect(validateQuery(q)).toEqual([]);
  });

  it("count puro (sin field_key) es válido — no necesita campo", () => {
    const q: QuerySpec = { type: "aggregation", aggregation: "count", field_key: null, distinct_field_key: null, filters: [] };
    expect(validateQuery(q)).toEqual([]);
  });

  it("un filtro sin valor cargado es inválido", () => {
    const q: QuerySpec = {
      type: "aggregation",
      aggregation: "sum",
      field_key: "monto",
      distinct_field_key: null,
      filters: [{ field_key: "categoria", operator: "==", value: undefined }],
    };
    const issues = validateQuery(q);
    expect(issues.some((i) => i.message.includes("Falta cargar"))).toBe(true);
  });

  it("una métrica referenciándose a sí misma es inválida", () => {
    const q: QuerySpec = { type: "metric_ref", metric_id: "metric-1" };
    const issues = validateQuery(q, { selfMetricId: "metric-1" });
    expect(issues.some((i) => i.message.includes("no puede referenciarse a sí misma"))).toBe(true);
  });

  it("valida recursivamente ambos lados de un árbol aritmético", () => {
    const q: QuerySpec = wrapInArithmetic("+", blankAggregationNode(), blankAggregationNode());
    expect(validateQuery(q)).toHaveLength(2);
  });
});

describe("findRangeConflicts", () => {
  it("dos filtros de rango en el mismo nodo de agregación es un conflicto real de Firestore", () => {
    const q: QuerySpec = {
      type: "aggregation",
      aggregation: "sum",
      field_key: "monto",
      distinct_field_key: null,
      filters: [
        { field_key: "fecha", operator: ">=", value: "2026-01-01" },
        { field_key: "monto", operator: "<", value: 1000 },
      ],
    };
    const conflicts = findRangeConflicts(q);
    expect(conflicts).toHaveLength(1);
    expect(conflicts[0].fields).toEqual(["fecha", "monto"]);
  });

  it("dos aggregations distintas combinadas por un aritmético pueden tener, cada una, su propio filtro de rango sin conflicto", () => {
    const left: QuerySpec = { type: "aggregation", aggregation: "sum", field_key: "a", distinct_field_key: null, filters: [{ field_key: "fecha", operator: ">=", value: "2026-01-01" }] };
    const right: QuerySpec = { type: "aggregation", aggregation: "sum", field_key: "b", distinct_field_key: null, filters: [{ field_key: "fecha", operator: "<", value: "2026-06-01" }] };
    expect(findRangeConflicts(wrapInArithmetic("+", left, right))).toEqual([]);
  });

  it("un solo filtro de rango no es conflicto", () => {
    const q: QuerySpec = { type: "aggregation", aggregation: "sum", field_key: "monto", distinct_field_key: null, filters: [{ field_key: "monto", operator: ">", value: 0 }] };
    expect(findRangeConflicts(q)).toEqual([]);
  });
});

describe("summarizeQuery", () => {
  it("resume una agregación simple en texto legible", () => {
    const q: QuerySpec = { type: "aggregation", aggregation: "sum", field_key: "monto", distinct_field_key: null, filters: [] };
    expect(summarizeQuery(q, { rawFieldLabel: () => "Monto" })).toBe("Suma de Monto");
  });

  it("resume un árbol aritmético con ambos operandos", () => {
    const q = wrapInArithmetic(
      "+",
      { type: "aggregation", aggregation: "sum", field_key: "a", distinct_field_key: null, filters: [] },
      { type: "aggregation", aggregation: "sum", field_key: "b", distinct_field_key: null, filters: [] }
    );
    expect(summarizeQuery(q, { rawFieldLabel: (k) => k.toUpperCase() })).toBe("Suma de A + Suma de B");
  });
});
