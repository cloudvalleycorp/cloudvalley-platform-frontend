import { describe, it, expect, vi, afterEach } from "vitest";
import {
  exportReportPdf,
  htmlByteLength,
  loadLogoDataUrl,
  MAX_LOGO_BYTES,
  MAX_REPORT_PDF_HTML_BYTES,
  PDF_FAILED_MESSAGE,
  PDF_TOO_HEAVY_MESSAGE,
} from "@/lib/reportPdfExport";

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("exportReportPdf", () => {
  it("no manda nada al backend si el HTML supera 2 MB", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    const huge = "a".repeat(MAX_REPORT_PDF_HTML_BYTES + 1);
    const result = await exportReportPdf("r1", huge);
    expect(result).toEqual({ ok: false, message: PDF_TOO_HEAVY_MESSAGE });
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("envía el contrato {report_id, html} y devuelve la URL de descarga", async () => {
    const fetchMock = vi.fn().mockResolvedValue({
      ok: true,
      status: 200,
      json: async () => ({ download_url: "https://storage.example/pdf" }),
    });
    vi.stubGlobal("fetch", fetchMock);
    const result = await exportReportPdf("r1", "<!doctype html><p>x</p>");
    expect(result).toEqual({ ok: true, downloadUrl: "https://storage.example/pdf" });
    const [, init] = fetchMock.mock.calls[0];
    expect(JSON.parse(init.body)).toEqual({ report_id: "r1", html: "<!doctype html><p>x</p>" });
    expect(init.method).toBe("POST");
  });

  it("un 413 del backend se muestra como PDF demasiado pesado", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 413, json: async () => ({}) }));
    expect(await exportReportPdf("r1", "<p>x</p>")).toEqual({ ok: false, message: PDF_TOO_HEAVY_MESSAGE });
  });

  it("cualquier otro error muestra el mensaje genérico con reintento", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 500, json: async () => ({}) }));
    expect(await exportReportPdf("r1", "<p>x</p>")).toEqual({ ok: false, message: PDF_FAILED_MESSAGE });
  });

  it("una respuesta sin download_url no se da por buena", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, status: 200, json: async () => ({}) }));
    expect(await exportReportPdf("r1", "<p>x</p>")).toEqual({ ok: false, message: PDF_FAILED_MESSAGE });
  });
});

describe("loadLogoDataUrl", () => {
  it("sin URL no pide nada y devuelve null", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);
    expect(await loadLogoDataUrl(null)).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("una imagen chica se devuelve como data URL", async () => {
    const blob = new Blob(["png-bytes"], { type: "image/png" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => blob }));
    const dataUrl = await loadLogoDataUrl("https://storage.example/logo.png");
    expect(dataUrl?.startsWith("data:image/png;base64,")).toBe(true);
  });

  it("una imagen demasiado pesada o que no es imagen devuelve null", async () => {
    const big = new Blob([new Uint8Array(MAX_LOGO_BYTES + 1)], { type: "image/png" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => big }));
    expect(await loadLogoDataUrl("https://storage.example/big.png")).toBeNull();
    const notImage = new Blob(["x"], { type: "text/html" });
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, blob: async () => notImage }));
    expect(await loadLogoDataUrl("https://storage.example/page.html")).toBeNull();
  });

  it("un error de red o un 404 devuelven null sin romper el export", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("network")));
    expect(await loadLogoDataUrl("https://storage.example/logo.png")).toBeNull();
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: false, status: 404 }));
    expect(await loadLogoDataUrl("https://storage.example/logo.png")).toBeNull();
  });
});

describe("htmlByteLength", () => {
  it("cuenta bytes UTF-8, no caracteres", () => {
    expect(htmlByteLength("ñ")).toBe(2);
  });
});
