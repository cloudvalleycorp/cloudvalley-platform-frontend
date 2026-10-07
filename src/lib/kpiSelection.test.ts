import { describe, it, expect } from "vitest";
import { nextKpiSelection } from "@/lib/dashboardKpis";

const STANDARD = ["id-arr", "id-mrr", "id-revenue", "id-cash"];

describe("nextKpiSelection", () => {
  it("al marcar un estándar lo pone en el orden canónico, no al final", () => {
    expect(nextKpiSelection(["id-cash", "id-arr"], STANDARD, "id-mrr", true)).toEqual(["id-arr", "id-mrr", "id-cash"]);
  });

  it("desmarcar y volver a marcar deja exactamente la misma lista (ida y vuelta)", () => {
    const base = ["id-arr", "id-mrr", "id-revenue", "id-cash"];
    const off = nextKpiSelection(base, STANDARD, "id-mrr", false);
    expect(off).toEqual(["id-arr", "id-revenue", "id-cash"]);
    expect(nextKpiSelection(off, STANDARD, "id-mrr", true)).toEqual(base);
  });

  it("conserva los KPIs propios y su orden al tocar un estándar", () => {
    const current = ["id-custom-b", "id-arr", "id-custom-a"];
    expect(nextKpiSelection(current, STANDARD, "id-cash", true)).toEqual(["id-arr", "id-cash", "id-custom-b", "id-custom-a"]);
    expect(nextKpiSelection(current, STANDARD, "id-arr", false)).toEqual(["id-custom-b", "id-custom-a"]);
  });

  it("marcar un id que ya estaba no duplica nada", () => {
    expect(nextKpiSelection(["id-arr"], STANDARD, "id-arr", true)).toEqual(["id-arr"]);
  });
});
