import { describe, it, expect } from "vitest";
import { fieldCountLabel } from "@/lib/sheetsIntegration";

describe("fieldCountLabel", () => {
  it("el bug real (2026-09-01): field_mappings null (conexiones grid/eav) no rompe, muestra 'mapeo avanzado'", () => {
    expect(fieldCountLabel(null)).toBe("mapeo avanzado");
  });

  it("singular con un solo campo", () => {
    expect(fieldCountLabel([{ column: "Monto", field_key: "monto", value_type: "number" }])).toBe("1 campo");
  });

  it("plural con varios campos", () => {
    expect(
      fieldCountLabel([
        { column: "Monto", field_key: "monto", value_type: "number" },
        { column: "Cliente", field_key: "cliente", value_type: "text" },
      ])
    ).toBe("2 campos");
  });

  it("array vacío (conexión tabular sin ningún campo mapeado todavía) muestra '0 campos'", () => {
    expect(fieldCountLabel([])).toBe("0 campos");
  });
});
