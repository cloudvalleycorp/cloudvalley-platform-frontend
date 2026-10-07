import { describe, it, expect } from "vitest";
import { buildReportPdfHtml, escapeHtml, sparklineSvg } from "@/lib/reportPdf";

describe("escapeHtml", () => {
  it("un valor ausente se convierte en texto vacío, nunca en 'undefined'", () => {
    expect(escapeHtml(undefined)).toBe("");
    expect(escapeHtml(null)).toBe("");
  });

  it("escapa los caracteres que rompen el documento", () => {
    expect(escapeHtml(`<script>alert("x")</script> & 'y'`)).toBe(
      "&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; &amp; &#39;y&#39;"
    );
  });
});

describe("sparklineSvg", () => {
  it("sin ningún punto no dibuja nada", () => {
    expect(sparklineSvg([null, null, null])).toBe("");
  });

  it("un solo punto dibuja un marcador, no una línea", () => {
    const svg = sparklineSvg([null, 5, null]);
    expect(svg).toContain("<circle");
    expect(svg).not.toContain("<polyline");
  });

  it("valores planos quedan en el medio y no dividen por cero", () => {
    const svg = sparklineSvg([4, 4, 4]);
    expect(svg).toContain("<polyline");
    expect(svg).not.toContain("NaN");
    expect(svg).not.toContain("Infinity");
  });

  it("valores negativos se dibujan sin NaN", () => {
    const svg = sparklineSvg([-3, -1, 2]);
    expect(svg).toContain("<polyline");
    expect(svg).not.toContain("NaN");
  });

  it("un hueco (null) no rompe la línea de los demás puntos", () => {
    const svg = sparklineSvg([1, null, 3]);
    const points = svg.match(/points="([^"]+)"/)?.[1].split(" ") ?? [];
    expect(points).toHaveLength(2);
  });
});

describe("buildReportPdfHtml logo", () => {
  const base = { reportName: "Board", companyName: "Maritos V3", periodLabel: "abril 2026", generatedLabel: "4 de octubre de 2026", prevPeriodLabel: "marzo", sections: [] };

  it("con logo usa la imagen en data URL, sin monograma", () => {
    const html = buildReportPdfHtml({ ...base, logoDataUrl: "data:image/png;base64,AAAA" });
    expect(html).toContain('<img class="logo" src="data:image/png;base64,AAAA"');
    expect(html).not.toContain('class="mono"');
  });

  it("sin logo cae al monograma con iniciales", () => {
    const html = buildReportPdfHtml({ ...base, logoDataUrl: null });
    expect(html).toContain('class="mono"');
    expect(html).toContain(">MV<");
  });
});

describe("buildReportPdfHtml", () => {
  const html = buildReportPdfHtml({
    reportName: `Board <img src=x onerror=alert(1)>`,
    companyName: "Maritos V3",
    periodLabel: "abril 2026",
    generatedLabel: "3 de octubre de 2026",
    prevPeriodLabel: "marzo",
    sections: [
      {
        title: "Ingresos",
        subtitle: null,
        blocks: [
          { name: "MRR", unit: "$", current: 1200, change: 12.5, spark: [1000, null, 1100, 1150, 1180, 1200], missingLabel: "Sin dato en abril 2026" },
          { name: "Churn", unit: "%", current: null, change: null, spark: [null, null, null, null, null, null], missingLabel: "Sin dato en abril 2026" },
        ],
      },
    ],
  });

  it("es un documento autocontenido: sin scripts ni recursos externos", () => {
    expect(html.startsWith("<!doctype html>")).toBe(true);
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/https?:\/\//);
    expect(html).not.toMatch(/url\(/);
    expect(html).not.toMatch(/<link/i);
  });

  it("escapa el nombre del reporte y no deja pasar HTML inyectado", () => {
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("Board &lt;img src=x onerror=alert(1)&gt;");
  });

  it("muestra el faltante con su período y nunca un cero inventado", () => {
    expect(html).toContain("Sin dato en abril 2026");
    expect(html).not.toMatch(/class="value">0</);
  });

  it("escribe la variación en palabras con coma decimal, como la pantalla", () => {
    expect(html).toContain("Sube 12,5% frente a marzo");
  });
});
