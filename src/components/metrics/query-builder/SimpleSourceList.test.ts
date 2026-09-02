import { describe, it, expect } from "vitest";
import { flattenSimpleSources, buildSimpleSources } from "@/components/metrics/query-builder/SimpleSourceList";
import { blankAggregationNode, wrapInArithmetic, type AggregationNode, type QuerySpec } from "@/lib/querySpec";

function agg(field_key: string): AggregationNode {
  return { type: "aggregation", aggregation: "sum", field_key, distinct_field_key: null, filters: [] };
}

describe("flattenSimpleSources", () => {
  it("null es una lista vacía (punto de partida, no 'no representable')", () => {
    expect(flattenSimpleSources(null)).toEqual([]);
  });

  it("una sola agregación sin filtros/ventana es una lista de 1", () => {
    const node = agg("monto");
    expect(flattenSimpleSources(node)).toEqual([node]);
  });

  it("dos agregaciones sumadas se aplanan a una lista de 2, en orden", () => {
    const a = agg("monto_a");
    const b = agg("monto_b");
    expect(flattenSimpleSources(wrapInArithmetic("+", a, b))).toEqual([a, b]);
  });

  it("tres agregaciones sumadas (árbol anidado) se aplanan a una lista de 3, en orden", () => {
    const a = agg("a");
    const b = agg("b");
    const c = agg("c");
    const tree = wrapInArithmetic("+", wrapInArithmetic("+", a, b), c);
    expect(flattenSimpleSources(tree)).toEqual([a, b, c]);
  });

  it("una resta (Revenue - COGS) NO es representable como lista simple -> null", () => {
    expect(flattenSimpleSources(wrapInArithmetic("-", agg("revenue"), agg("cogs")))).toBeNull();
  });

  it("un metric_ref mezclado con una agregación NO es representable -> null", () => {
    const tree: QuerySpec = { type: "arithmetic", operator: "+", left: agg("a"), right: { type: "metric_ref", metric_id: "otra-metrica" } };
    expect(flattenSimpleSources(tree)).toBeNull();
  });

  it("una agregación con filtros NO es representable como fuente simple -> null", () => {
    const node: AggregationNode = { type: "aggregation", aggregation: "sum", field_key: "monto", distinct_field_key: null, filters: [{ field_key: "categoria", operator: "==", value: "SaaS" }] };
    expect(flattenSimpleSources(node)).toBeNull();
  });

  it("una agregación con ventana (window) NO es representable -> null", () => {
    const node: AggregationNode = { ...blankAggregationNode(), field_key: "monto", window: { months: 3 } };
    expect(flattenSimpleSources(node)).toBeNull();
  });
});

describe("buildSimpleSources", () => {
  it("lista vacía da null", () => {
    expect(buildSimpleSources([])).toBeNull();
  });

  it("una sola hoja no se envuelve en un arithmetic innecesario", () => {
    const a = agg("monto");
    expect(buildSimpleSources([a])).toBe(a);
  });

  it("round-trip: flatten(build([a,b,c])) reproduce la misma lista", () => {
    const leaves = [agg("a"), agg("b"), agg("c")];
    const rebuilt = flattenSimpleSources(buildSimpleSources(leaves));
    expect(rebuilt).toEqual(leaves);
  });

  it("quitar una fuente del medio y reconstruir preserva las otras dos, combinadas", () => {
    const leaves = [agg("a"), agg("b"), agg("c")];
    const afterRemoving1 = [leaves[0], leaves[2]]; // simula removeLeaf(1)
    const tree = buildSimpleSources(afterRemoving1);
    expect(flattenSimpleSources(tree)).toEqual(afterRemoving1);
  });
});
