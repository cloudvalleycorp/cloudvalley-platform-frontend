import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { GridLayoutMapping } from "@/components/metrics/GridLayoutMapping";
import type { ConceptAxisEntry, PeriodAxisEntry } from "@/lib/sheetsIntegration";

const PERIOD_AXIS: PeriodAxisEntry[] = [
  { index: 0, period: "2026-01", confidence: { score: 0.95, basis: "header dice Enero" } },
  { index: 1, period: "2026-02", confidence: { score: 0.95, basis: "header dice Febrero" } },
];

const CONCEPT_AXIS: ConceptAxisEntry[] = [
  { index: 0, label: "Venta bruta", suggested_field_key: "venta_bruta", value_type: "number", data_maturity: "raw", confidence: { score: 0.9, basis: "fila con montos" } },
  { index: 1, label: "Ingresos Totales", suggested_field_key: "ingresos_totales", value_type: "number", data_maturity: "calculated", derived_from: ["venta_bruta", "otros_ingresos"], confidence: { score: 0.85, basis: "suma de las filas anteriores" } },
];

// Primer test de componente del repo (2026-09-01) — GridLayoutMapping es
// el mapeo real que este mismo día se probó en vivo (fórmulas de Excel sin
// valor cacheado, ver querySpec/sheetsIntegration para el contrato). El
// riesgo real acá no es "no renderiza" sino "toqué la fila equivocada del
// índice equivocado" (ver comentario de setup.ts) — por eso los casos
// centrales son de edición, no solo de render. Usa fireEvent (no
// @testing-library/user-event, no instalado en el repo) — alcanza para
// Input nativo y para el trigger/option de Select vía click sintético.
describe("GridLayoutMapping", () => {
  it("muestra los períodos detectados como badges", () => {
    render(<GridLayoutMapping periodOrientation="columns" periodAxis={PERIOD_AXIS} conceptAxis={CONCEPT_AXIS} onChange={() => {}} />);
    expect(screen.getByText("2026-01")).toBeInTheDocument();
    expect(screen.getByText("2026-02")).toBeInTheDocument();
  });

  it("sin períodos detectados, muestra el aviso de revisión manual", () => {
    render(<GridLayoutMapping periodOrientation="columns" periodAxis={[]} conceptAxis={CONCEPT_AXIS} onChange={() => {}} />);
    expect(screen.getByText(/No se detectó ningún período/)).toBeInTheDocument();
  });

  it("muestra la proveniencia de un concepto calculado (derived_from)", () => {
    render(<GridLayoutMapping periodOrientation="columns" periodAxis={PERIOD_AXIS} conceptAxis={CONCEPT_AXIS} onChange={() => {}} />);
    expect(screen.getByText("Calculado a partir de: venta_bruta, otros_ingresos")).toBeInTheDocument();
  });

  it("editar el nombre de campo de un concepto solo cambia ESE concepto, el resto queda intacto", () => {
    const onChange = vi.fn();
    render(<GridLayoutMapping periodOrientation="columns" periodAxis={PERIOD_AXIS} conceptAxis={CONCEPT_AXIS} onChange={onChange} />);

    const input = screen.getByLabelText("Nombre de campo para Ingresos Totales");
    fireEvent.change(input, { target: { value: "ingresos_totales_v2" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ConceptAxisEntry[];
    expect(next[0]).toEqual(CONCEPT_AXIS[0]); // primera fila sin tocar
    expect(next[1].suggested_field_key).toBe("ingresos_totales_v2");
    expect(next[1].index).toBe(1);
  });

  it("cambiar '¿Dato crudo o calculado?' de un concepto solo afecta ese concepto", async () => {
    const onChange = vi.fn();
    render(<GridLayoutMapping periodOrientation="columns" periodAxis={PERIOD_AXIS} conceptAxis={CONCEPT_AXIS} onChange={onChange} />);

    fireEvent.click(screen.getByLabelText("¿Dato crudo o calculado? para Venta bruta"));
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("Ya calculado"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as ConceptAxisEntry[];
    expect(next[0].data_maturity).toBe("calculated");
    expect(next[0].index).toBe(0);
    expect(next[1]).toEqual(CONCEPT_AXIS[1]); // segunda fila sin tocar
  });
});
