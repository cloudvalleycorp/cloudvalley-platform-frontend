import { describe, it, expect } from "vitest";
import { buildReportPdfHtml, type ReportPdfBlock, type ReportPdfSection } from "@/lib/reportPdf";

function kpi(name: string, current: number | null = 100): ReportPdfBlock {
  return {
    name,
    unit: "$",
    current,
    change: current == null ? null : 5,
    spark: [],
    missingLabel: "Sin dato en octubre. El fondo lo ve así hasta que se cargue.",
  };
}

function render(sections: ReportPdfSection[]) {
  return buildReportPdfHtml({
    reportName: "Board",
    companyName: "Maritos V3",
    periodLabel: "octubre 2026",
    generatedLabel: "7 de octubre de 2026",
    prevPeriodLabel: "septiembre",
    sections,
  });
}

function slideCount(html: string): number {
  return (html.match(/<section class="slide/g) ?? []).length;
}

describe("formato 16:9: portada y una slide por sección", () => {
  it("portada más una slide por sección", () => {
    const html = render([
      { title: "Ingresos", subtitle: null, blocks: [kpi("MRR")] },
      { title: "Clientes", subtitle: null, blocks: [kpi("Clientes")] },
    ]);
    expect(slideCount(html)).toBe(3);
    expect(html).toContain('class="slide cover"');
  });

  it("el tamaño de página es 16:9", () => {
    const html = render([{ title: "Ingresos", subtitle: null, blocks: [kpi("MRR")] }]);
    expect(html).toContain("size: 960px 540px");
  });

  it("la numeración de páginas cuenta la portada", () => {
    const html = render([
      { title: "Ingresos", subtitle: null, blocks: [kpi("MRR")] },
      { title: "Clientes", subtitle: null, blocks: [kpi("Clientes")] },
    ]);
    expect(html).toContain("Página 1 de 3");
    expect(html).toContain("Página 3 de 3");
  });
});

describe("continuación de sección", () => {
  it("más de seis tarjetas pasan a una slide de continuación", () => {
    const blocks = Array.from({ length: 8 }, (_, i) => kpi(`KPI ${i + 1}`));
    const html = render([{ title: "Ingresos", subtitle: null, blocks }]);
    expect(slideCount(html)).toBe(3);
    expect(html).toContain("Ingresos (continuación)");
    expect(html.match(/class="card"|class="missing"/g)).toHaveLength(8);
  });

  it("seis tarjetas entran en una sola slide", () => {
    const blocks = Array.from({ length: 6 }, (_, i) => kpi(`KPI ${i + 1}`));
    const html = render([{ title: "Ingresos", subtitle: null, blocks }]);
    expect(slideCount(html)).toBe(2);
    expect(html).not.toContain("(continuación)");
  });
});

describe("nota de la sección", () => {
  it("se muestra en la slide de la sección", () => {
    const html = render([{ title: "Ingresos", subtitle: null, blocks: [kpi("MRR")], notes: "El MRR creció por el plan anual." }]);
    expect(html).toContain("Nota de la sección");
    expect(html).toContain("El MRR creció por el plan anual.");
  });

  it("aparece una sola vez aunque la sección tenga continuación", () => {
    const blocks = Array.from({ length: 8 }, (_, i) => kpi(`KPI ${i + 1}`));
    const html = render([{ title: "Ingresos", subtitle: null, blocks, notes: "Nota única" }]);
    expect(html.match(/Nota única/g)).toHaveLength(1);
  });

  it("no muestra contador de caracteres", () => {
    const html = render([{ title: "Ingresos", subtitle: null, blocks: [kpi("MRR")], notes: "Una nota" }]);
    expect(html).not.toMatch(/\/\s*500/);
    expect(html).not.toContain("caracteres");
  });

  it("sin nota no aparece el bloque", () => {
    const html = render([{ title: "Ingresos", subtitle: null, blocks: [kpi("MRR")], notes: null }]);
    expect(html).not.toContain("Nota de la sección");
  });

  it("una nota solo con espacios no aparece", () => {
    const html = render([{ title: "Ingresos", subtitle: null, blocks: [kpi("MRR")], notes: "   " }]);
    expect(html).not.toContain("Nota de la sección");
  });

  it("se escapa como cualquier texto del usuario", () => {
    const html = render([{ title: "Ingresos", subtitle: null, blocks: [kpi("MRR")], notes: "<img src=x onerror=alert(1)>" }]);
    expect(html).not.toContain("<img src=x");
    expect(html).toContain("&lt;img src=x onerror=alert(1)&gt;");
  });

  it("una sección sin métricas igual muestra su nota", () => {
    const html = render([{ title: "Clientes", subtitle: null, blocks: [], notes: "Sin altas este mes." }]);
    expect(html).toContain("Esta sección todavía no tiene métricas.");
    expect(html).toContain("Sin altas este mes.");
  });
});

describe("contenido del formato", () => {
  it("no dibuja gráficos ni sparklines", () => {
    const html = render([{ title: "Ingresos", subtitle: null, blocks: [kpi("MRR")] }]);
    expect(html).not.toContain('class="chart"');
    expect(html).not.toContain("<svg");
  });

  it("un KPI sin dato no es un cero", () => {
    const html = render([{ title: "Ingresos", subtitle: null, blocks: [kpi("Revenue", null)] }]);
    expect(html).toContain("Sin dato en octubre");
    expect(html).not.toMatch(/class="value">\$0/);
  });

  it("un reporte sin secciones dice qué pasa", () => {
    const html = render([]);
    expect(html).toContain("Este reporte todavía no tiene secciones.");
  });
});
