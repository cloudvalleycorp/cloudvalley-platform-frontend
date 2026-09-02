import { describe, it, expect } from "vitest";
import { computeFreshness, computeSourceStatus } from "@/lib/dataFreshness";

function daysAgo(n: number): string {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000).toISOString();
}

describe("computeFreshness", () => {
  it("sin timestamp es 'never'", () => {
    expect(computeFreshness(null).label).toBe("never");
  });
  it("menos de 2 días es 'live'", () => {
    expect(computeFreshness(daysAgo(1)).label).toBe("live");
  });
  it("entre 2 y 7 días es 'recent'", () => {
    expect(computeFreshness(daysAgo(4)).label).toBe("recent");
  });
  it("entre 7 y 21 días es 'stale'", () => {
    expect(computeFreshness(daysAgo(10)).label).toBe("stale");
  });
  it("más de 21 días es 'critical'", () => {
    expect(computeFreshness(daysAgo(30)).label).toBe("critical");
  });
});

describe("computeSourceStatus — el bug real encontrado esta sesión", () => {
  it("una conexión nunca sincronizada NUNCA da 'up_to_date', sin importar last_sync_status", () => {
    // Este es exactamente el caso que se vio en vivo: last_synced_at null,
    // last_sync_status también null (no "success" ni error) — antes del fix,
    // esto caía por las rendijas de la lógica vieja y mostraba "Al día".
    const status = computeSourceStatus({ last_synced_at: null, last_sync_status: null }, { reconnect_required: false });
    expect(status).toBe("never_synced");
    expect(status).not.toBe("up_to_date");
  });

  it("reconnect_required gana sobre cualquier otro estado (prioridad más alta)", () => {
    const status = computeSourceStatus({ last_synced_at: daysAgo(0), last_sync_status: "success" }, { reconnect_required: true });
    expect(status).toBe("reconnect_required");
  });

  it("un error de sync gana sobre la frescura, incluso si sincronizó hace poco", () => {
    const status = computeSourceStatus({ last_synced_at: daysAgo(0), last_sync_status: "error" }, { reconnect_required: false });
    expect(status).toBe("sync_error");
  });

  it("una conexión sincronizada hace 1 día, sin errores, sin cuenta -> 'up_to_date'", () => {
    const status = computeSourceStatus({ last_synced_at: daysAgo(0), last_sync_status: "success" }, undefined);
    expect(status).toBe("up_to_date");
  });

  it("una conexión Excel (sin cuenta de Google asociada) no rompe con account undefined", () => {
    expect(() => computeSourceStatus({ last_synced_at: daysAgo(30), last_sync_status: null }, undefined)).not.toThrow();
    expect(computeSourceStatus({ last_synced_at: daysAgo(30), last_sync_status: null }, undefined)).toBe("critical");
  });
});
