import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import type { MetricDef } from "@/lib/metrics";
import {
  DASHBOARD_KPI_MAX,
  DashboardKpiError,
  defaultDashboardKpiIds,
  fetchDashboardKpiIds,
  saveDashboardKpiIds,
  validateKpiSelection,
} from "@/lib/dashboardKpis";

// Solo los campos que lee esta lógica: el resto de MetricDef no se usa acá.
function metric(id: string, standardKey: string | null, name = id): MetricDef {
  return {
    id,
    name,
    metric_class: standardKey ? "standard" : "custom",
    standard_key: standardKey,
    unit: null,
  } as unknown as MetricDef;
}

function jsonResponse(status: number, body: unknown): Response {
  return { ok: status >= 200 && status < 300, status, json: async () => body } as unknown as Response;
}

const COMPANY = "company-a";

describe("defaultDashboardKpiIds", () => {
  it("usa la métrica estándar de cada clave en el orden de STANDARD_KEY_ORDER", () => {
    const metrics = [metric("m-cash", "cash"), metric("m-arr", "arr"), metric("m-propia", null)];
    expect(defaultDashboardKpiIds(metrics)).toEqual(["m-arr", "m-cash"]);
  });

  it("omite las claves que la cuenta no tiene, sin dejar tarjetas vacías", () => {
    expect(defaultDashboardKpiIds([metric("m-mrr", "mrr")])).toEqual(["m-mrr"]);
  });

  it("nunca pasa de DASHBOARD_KPI_MAX", () => {
    const metrics = ["arr", "mrr", "revenue", "growth", "gross_margin", "burn", "runway", "cash"].map((k) => metric(`m-${k}`, k));
    expect(defaultDashboardKpiIds(metrics).length).toBeLessThanOrEqual(DASHBOARD_KPI_MAX);
  });
});

describe("validateKpiSelection", () => {
  it("rechaza una selección vacía", () => {
    expect(validateKpiSelection([])).toBe("Elegí al menos 1 KPI.");
  });

  it("rechaza más de DASHBOARD_KPI_MAX", () => {
    const ids = Array.from({ length: DASHBOARD_KPI_MAX + 1 }, (_, i) => `m-${i}`);
    expect(validateKpiSelection(ids)).toBe(`Máximo ${DASHBOARD_KPI_MAX} KPIs.`);
  });

  it("rechaza ids repetidos", () => {
    expect(validateKpiSelection(["m-arr", "m-arr"])).toBe("Hay KPIs repetidos en la selección.");
  });

  it("acepta una selección válida, incluso con el máximo exacto", () => {
    expect(validateKpiSelection(["m-arr"])).toBeNull();
    const max = Array.from({ length: DASHBOARD_KPI_MAX }, (_, i) => `m-${i}`);
    expect(validateKpiSelection(max)).toBeNull();
  });
});

describe("fetchDashboardKpiIds", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("null del backend significa nunca configurado", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { kpi_metric_ids: null }));
    await expect(fetchDashboardKpiIds(COMPANY)).resolves.toBeNull();
  });

  it("devuelve la lista guardada en el mismo orden, sin reordenar", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { kpi_metric_ids: ["m-cash", "m-arr"] }));
    await expect(fetchDashboardKpiIds(COMPANY)).resolves.toEqual(["m-cash", "m-arr"]);
  });

  it("[] se devuelve tal cual: configurado con todo archivado, nunca el default", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { kpi_metric_ids: [] }));
    await expect(fetchDashboardKpiIds(COMPANY)).resolves.toEqual([]);
  });

  it("manda company_id en la query y la sesión con credentials", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { kpi_metric_ids: null }));
    await fetchDashboardKpiIds("company a");
    const [url, init] = fetchMock.mock.calls[0];
    expect(url).toContain("get-dashboard-kpis?company_id=company%20a");
    expect(init).toMatchObject({ credentials: "include" });
  });

  it("un error del backend se propaga como DashboardKpiError", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(403, { error: "No autorizado" }));
    await expect(fetchDashboardKpiIds(COMPANY)).rejects.toMatchObject({ message: "No autorizado" });
  });
});

describe("saveDashboardKpiIds", () => {
  const fetchMock = vi.fn();

  beforeEach(() => {
    fetchMock.mockReset();
    vi.stubGlobal("fetch", fetchMock);
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it("manda la selección completa y devuelve la lista que confirma el backend", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(200, { kpi_metric_ids: ["m-arr", "m-cash"] }));
    const saved = await saveDashboardKpiIds(COMPANY, ["m-arr", "m-cash"]);
    expect(saved).toEqual(["m-arr", "m-cash"]);
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ company_id: COMPANY, kpi_metric_ids: ["m-arr", "m-cash"] });
  });

  it("no llama al backend si la selección es inválida", async () => {
    const ids = Array.from({ length: DASHBOARD_KPI_MAX + 1 }, (_, i) => `m-${i}`);
    await expect(saveDashboardKpiIds(COMPANY, ids)).rejects.toBeInstanceOf(DashboardKpiError);
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("un 400 con invalid_metric_ids trae esos ids para quitarlos del selector", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse(400, {
        error: "Hay métricas que no existen o están archivadas en tu startup",
        invalid_metric_ids: ["m-vieja"],
      })
    );
    const err = await saveDashboardKpiIds(COMPANY, ["m-arr", "m-vieja"]).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DashboardKpiError);
    expect((err as DashboardKpiError).invalidMetricIds).toEqual(["m-vieja"]);
    expect((err as DashboardKpiError).message).toBe("Hay métricas que no existen o están archivadas en tu startup");
  });

  it("un 400 sin invalid_metric_ids muestra el mensaje del backend y ningún id", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse(400, { error: "Máximo 12 KPIs" }));
    const err = await saveDashboardKpiIds(COMPANY, ["m-arr"]).catch((e: unknown) => e);
    expect((err as DashboardKpiError).message).toBe("Máximo 12 KPIs");
    expect((err as DashboardKpiError).invalidMetricIds).toEqual([]);
  });

  it("un error sin cuerpo JSON cae al mensaje genérico", async () => {
    fetchMock.mockResolvedValueOnce({ ok: false, status: 503, json: async () => Promise.reject(new Error("no json")) } as unknown as Response);
    const err = await saveDashboardKpiIds(COMPANY, ["m-arr"]).catch((e: unknown) => e);
    expect((err as DashboardKpiError).message).toBe("No pudimos guardar la selección.");
  });
});
