import { describe, it, expect } from "vitest";
import { orderKpiIds } from "@/lib/dashboardKpis";

const STANDARD = ["id-arr", "id-mrr", "id-revenue", "id-cash"];

describe("orderKpiIds", () => {
  it("pone los estándar en orden canónico sin importar el orden en que se marcaron", () => {
    expect(orderKpiIds(["id-cash", "id-arr", "id-mrr"], STANDARD)).toEqual(["id-arr", "id-mrr", "id-cash"]);
  });

  it("deja los propios después de los estándar, en su orden", () => {
    expect(orderKpiIds(["id-custom-b", "id-cash", "id-custom-a", "id-arr"], STANDARD)).toEqual([
      "id-arr",
      "id-cash",
      "id-custom-b",
      "id-custom-a",
    ]);
  });

  it("marcar, desmarcar y volver a marcar en el Dashboard deja el mismo orden que el default", () => {
    const original = ["id-arr", "id-mrr", "id-revenue", "id-cash"];
    const withoutMrr = orderKpiIds(["id-arr", "id-revenue", "id-cash"], STANDARD);
    const restored = orderKpiIds([...withoutMrr, "id-mrr"], STANDARD);
    expect(restored).toEqual(original);
  });
});
