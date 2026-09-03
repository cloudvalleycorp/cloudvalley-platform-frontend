import { describe, it, expect, vi } from "vitest";
import { render, screen, fireEvent, within } from "@testing-library/react";
import { EavLayoutMapping } from "@/components/metrics/EavLayoutMapping";
import type { EavMetricMapping } from "@/lib/sheetsIntegration";

const METRIC_MAPPING: EavMetricMapping[] = [
  { observed_value: "MRR", field_key: "mrr", value_type: "number", data_maturity: "raw", confidence: { score: 1, basis: "nombre de métrica explícito" } },
  { observed_value: "Nuevos clientes", field_key: "nuevos_clientes", value_type: "number", data_maturity: "raw", confidence: { score: 1, basis: "nombre de métrica explícito" } },
  { observed_value: "Churn", field_key: "churn", value_type: "number", data_maturity: "raw", confidence: { score: 1, basis: "nombre de métrica explícito" } },
];

// Segundo test de componente del repo (2026-09-01, junto a
// GridLayoutMapping.test.tsx) — mismo criterio: el riesgo real es "toqué la
// fila equivocada del índice equivocado" al editar, no que falte renderizar
// algo (ver setup.ts para los polyfills de Radix que esto necesita).
describe("EavLayoutMapping", () => {
  it("muestra las columnas de período/nombre de métrica/valor y las métricas encontradas", () => {
    render(
      <EavLayoutMapping periodColumn="Fecha" metricNameColumn="Métrica" valueColumn="Valor" metricMapping={METRIC_MAPPING} onChange={() => {}} />
    );
    expect(screen.getByText("Fecha")).toBeInTheDocument();
    expect(screen.getByText("Métrica")).toBeInTheDocument();
    expect(screen.getByText("Valor")).toBeInTheDocument();
    expect(screen.getByText('Métricas encontradas en "Métrica" (3)')).toBeInTheDocument();
    expect(screen.getByText("Nuevos clientes")).toBeInTheDocument();
  });

  it("sin ninguna métrica detectada, muestra el aviso correspondiente", () => {
    render(<EavLayoutMapping periodColumn="Fecha" metricNameColumn="Métrica" valueColumn="Valor" metricMapping={[]} onChange={() => {}} />);
    expect(screen.getByText("No se encontró ningún valor de métrica en esta columna.")).toBeInTheDocument();
  });

  it("editar el nombre de campo de una fila solo cambia ESA fila, el resto queda intacto", () => {
    const onChange = vi.fn();
    render(
      <EavLayoutMapping periodColumn="Fecha" metricNameColumn="Métrica" valueColumn="Valor" metricMapping={METRIC_MAPPING} onChange={onChange} />
    );

    const input = screen.getByLabelText("Nombre de campo para Nuevos clientes");
    fireEvent.change(input, { target: { value: "nuevos_clientes_v2" } });

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as EavMetricMapping[];
    expect(next[0]).toEqual(METRIC_MAPPING[0]); // MRR sin tocar
    expect(next[1].field_key).toBe("nuevos_clientes_v2");
    expect(next[2]).toEqual(METRIC_MAPPING[2]); // Churn sin tocar
  });

  it("cambiar el tipo de dato de una fila a Texto solo afecta esa fila", async () => {
    const onChange = vi.fn();
    render(
      <EavLayoutMapping periodColumn="Fecha" metricNameColumn="Métrica" valueColumn="Valor" metricMapping={METRIC_MAPPING} onChange={onChange} />
    );

    fireEvent.click(screen.getByLabelText("Tipo de dato para Churn"));
    const listbox = await screen.findByRole("listbox");
    fireEvent.click(within(listbox).getByText("Texto"));

    expect(onChange).toHaveBeenCalledTimes(1);
    const next = onChange.mock.calls[0][0] as EavMetricMapping[];
    expect(next[0]).toEqual(METRIC_MAPPING[0]); // MRR sin tocar
    expect(next[1]).toEqual(METRIC_MAPPING[1]); // Nuevos clientes sin tocar
    expect(next[2].value_type).toBe("text");
  });
});
