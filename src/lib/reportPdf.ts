// Builder del PDF de un reporte, formato horizontal 16:9 aprobado en el mockup
// reporting-founder (PDF 16:9): portada + una slide por sección, con sus KPIs.
// Si una sección no entra en seis tarjetas, sigue en slides de continuación.
// El backend lo convierte a PDF, así que todo lo que escribe el usuario pasa por
// escapeHtml.
//
// Fuera de esta versión (ver backlog.md): gráficos con ejes. Están aprobados como
// diseño, pero dependen del modelo de bloques.

export type ReportPdfBlock = {
  name: string;
  unit: string | null;
  current: number | null;
  // Variación porcentual frente al período anterior, null si no hay base.
  change: number | null;
  // Serie de 6 períodos, del más viejo al actual. null = sin dato ese mes.
  spark: (number | null)[];
  // Texto de la caja de faltante, ej. "Sin dato en abril. El fondo lo ve así hasta que se cargue."
  missingLabel: string;
};

export type ReportPdfSection = {
  title: string;
  subtitle: string | null;
  blocks: ReportPdfBlock[];
  // Nota de la sección. Se muestra en la primera slide de la sección, sin contador.
  notes?: string | null;
};

export type ReportPdfInput = {
  reportName: string;
  companyName: string;
  // Logo de la startup como data URL (base64). null = monograma con iniciales.
  logoDataUrl?: string | null;
  periodLabel: string;
  generatedLabel: string;
  // Versión publicada. null = todavía no se publicó (borrador).
  version?: number | null;
  // Mes anterior en texto ("marzo"), para "Sube 4,2% frente a marzo".
  prevPeriodLabel: string;
  sections: ReportPdfSection[];
};

// Tokens de la paleta aprobada, en hex porque el PDF no lee variables CSS.
const BRAND = "#B8402B";
const FG = "#1A1A2E";
const MUTED = "#6B6B80";
const LINE = "#E8E8EE";
const DRAFT = "#5A5A70";

// Seis tarjetas por slide: tres columnas, dos filas.
const CARDS_PER_SLIDE = 6;

export function escapeHtml(value: string | null | undefined): string {
  return (value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

export function formatPdfNumber(value: number): string {
  return value.toLocaleString("es-AR", { maximumFractionDigits: 2 });
}

// Valor con su unidad como en la pantalla: "$84.000", "4,2%", "11,4 meses".
export function formatPdfValue(value: number, unit: string | null): string {
  const n = formatPdfNumber(value);
  if (unit === "%") return `${n}%`;
  if (unit === "$" || unit === "USD") return `$${n}`;
  return unit ? `${n} ${unit}` : n;
}

// Sparkline en SVG, sin ejes. No se usa en el reporte (los gráficos están en
// backlog.md); se conserva porque tiene tests propios.
export function sparklineSvg(values: (number | null)[], width = 240, height = 48): string {
  const points = values
    .map((v, i) => (v == null || Number.isNaN(v) ? null : { i, v }))
    .filter((p): p is { i: number; v: number } => p !== null);
  if (points.length === 0) return "";

  const n = values.length;
  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const span = max - min;
  const x = (i: number) => (n <= 1 ? width / 2 : (i / (n - 1)) * width);
  const y = (v: number) => (span === 0 ? height / 2 : height - ((v - min) / span) * (height - 6) - 3);

  const guides = [0.25, 0.5, 0.75]
    .map((f) => `<line x1="0" y1="${(height * f).toFixed(1)}" x2="${width}" y2="${(height * f).toFixed(1)}" stroke="${LINE}" stroke-width="0.6"/>`)
    .join("");
  const body =
    points.length === 1
      ? `<circle cx="${x(points[0].i).toFixed(1)}" cy="${y(points[0].v).toFixed(1)}" r="3" fill="${BRAND}"/>`
      : `<polyline fill="none" stroke="${BRAND}" stroke-width="2.2" stroke-linejoin="round" points="${points
          .map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`)
          .join(" ")}"/>`;

  return `<svg class="spark" viewBox="0 0 ${width} ${height}" preserveAspectRatio="none" role="img" aria-label="Tendencia de los últimos seis meses">${guides}${body}</svg>`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

// Texto de la variación, con la misma redacción que la pantalla.
function deltaText(change: number | null, prevLabel: string): string {
  if (change == null || Number.isNaN(change)) return "";
  const abs = Math.abs(change).toLocaleString("es-AR", { maximumFractionDigits: 1 });
  if (change === 0) return `Sin variación frente a ${prevLabel}`;
  return `${change > 0 ? "Sube" : "Baja"} ${abs}% frente a ${prevLabel}`;
}

function cardHtml(block: ReportPdfBlock, prevLabel: string): string {
  if (block.current == null || Number.isNaN(block.current)) {
    return `<article class="missing">
  <strong>${escapeHtml(block.name)}</strong>
  <p>${escapeHtml(block.missingLabel)}</p>
</article>`;
  }
  const delta = deltaText(block.change, prevLabel);
  return `<article class="card">
  <p class="name">${escapeHtml(block.name)}</p>
  <p class="value">${escapeHtml(formatPdfValue(block.current, block.unit))}</p>
  ${delta ? `<p class="delta">${escapeHtml(delta)}</p>` : ""}
</article>`;
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

// Una sección ocupa una slide por cada tanda de tarjetas. Las tandas siguientes
// llevan "(continuación)" en el título.
// La nota va en la primera slide de la sección: es un texto de la sección entera.
type SectionSlide = { title: string; subtitle: string | null; blocks: ReportPdfBlock[]; notes: string | null };

function sectionSlides(section: ReportPdfSection): SectionSlide[] {
  const notes = section.notes?.trim() ? section.notes : null;
  const batches = chunk(section.blocks, CARDS_PER_SLIDE);
  if (batches.length === 0) return [{ title: section.title, subtitle: section.subtitle, blocks: [], notes }];
  return batches.map((blocks, i) => ({
    title: i === 0 ? section.title : `${section.title} (continuación)`,
    subtitle: i === 0 ? section.subtitle : null,
    blocks,
    notes: i === 0 ? notes : null,
  }));
}

function footerHtml(page: number, total: number): string {
  return `<footer class="footer"><span>CloudValley</span><span>Página ${page} de ${total}</span></footer>`;
}

function coverHtml(input: ReportPdfInput, page: number, total: number): string {
  const versionLabel = input.version != null ? `Versión ${input.version}` : "Borrador";
  return `<section class="slide cover">
  <div class="cover-top">
    ${
      input.logoDataUrl
        ? `<img class="logo" src="${escapeHtml(input.logoDataUrl)}" alt="">`
        : `<span class="mono" aria-hidden="true">${escapeHtml(initialsOf(input.companyName))}</span>`
    }
    <div>
      <p class="kicker">${escapeHtml(input.companyName)}</p>
      <h1>${escapeHtml(input.reportName)}</h1>
    </div>
  </div>
  <div>
    <span class="pill">${escapeHtml(input.periodLabel)}</span>
    <p class="small">${escapeHtml(versionLabel)} · Generado el ${escapeHtml(input.generatedLabel)}</p>
    <div class="accent" aria-hidden="true"></div>
  </div>
  ${footerHtml(page, total)}
</section>`;
}

function sectionSlideHtml(slide: SectionSlide, input: ReportPdfInput, page: number, total: number): string {
  const cards = slide.blocks.map((b) => cardHtml(b, input.prevPeriodLabel)).join("");
  return `<section class="slide">
  <header>
    <p class="kicker">${escapeHtml(input.reportName)} · ${escapeHtml(input.periodLabel)}</p>
    <h2>${escapeHtml(slide.title)}</h2>
    ${slide.subtitle ? `<p class="sub">${escapeHtml(slide.subtitle)}</p>` : ""}
  </header>
  ${slide.blocks.length ? `<div class="grid">${cards}</div>` : `<p class="empty">Esta sección todavía no tiene métricas.</p>`}
  ${
    slide.notes
      ? `<div class="note">
    <p class="kicker">Nota de la sección</p>
    <p class="note-text">${escapeHtml(slide.notes)}</p>
  </div>`
      : ""
  }
  ${footerHtml(page, total)}
</section>`;
}

const PDF_CSS = `
@page { size: 960px 540px; margin: 0; }
* { box-sizing: border-box; }
body { margin: 0; color: ${FG}; font-family: Geist, "Helvetica Neue", Arial, sans-serif; font-size: 14px; line-height: 1.5; background: #ffffff; }
h1 { font-size: 44px; font-weight: 500; letter-spacing: -0.01em; margin: 0; }
h2 { font-size: 28px; font-weight: 500; letter-spacing: -0.01em; margin: 4px 0 0; }
p { margin: 0; }
.slide { width: 960px; height: 540px; padding: 40px 48px; display: flex; flex-direction: column; justify-content: space-between; background: #ffffff; overflow: hidden; break-after: page; page-break-after: always; }
.slide:last-child { break-after: auto; page-break-after: auto; }
.cover { justify-content: space-between; padding: 56px 64px; }
.cover-top { display: flex; gap: 16px; align-items: center; }
.cover-top > div { flex: 1 1 auto; min-width: 0; }
.kicker { font-size: 12px; color: ${MUTED}; text-transform: uppercase; letter-spacing: 0.08em; }
.sub { font-size: 14px; color: ${MUTED}; margin-top: 4px; }
.small { font-size: 14px; color: ${MUTED}; margin-top: 14px; }
.logo { width: 56px; height: 56px; object-fit: contain; flex-shrink: 0; }
.mono { width: 56px; height: 56px; border-radius: 8px; background: ${BRAND}; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 20px; font-weight: 500; flex-shrink: 0; }
.pill { display: inline-flex; align-items: center; gap: 8px; font-size: 14px; font-weight: 500; padding: 4px 14px; border-radius: 999px; background: ${DRAFT}; color: #ffffff; }
.accent { width: 40px; height: 2px; background: ${BRAND}; margin-top: 24px; }
.grid { display: grid; grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 12px; }
.card { border: 1px solid ${LINE}; border-radius: 8px; padding: 14px 16px; min-width: 0; }
.name { font-size: 12px; color: ${MUTED}; }
.value { font-size: 22px; font-weight: 500; letter-spacing: -0.02em; font-variant-numeric: tabular-nums; margin-top: 6px; }
.delta { font-size: 12px; color: ${MUTED}; margin-top: 4px; }
.missing { border: 1px dashed ${LINE}; border-radius: 8px; padding: 14px 16px; font-size: 12px; color: ${MUTED}; min-width: 0; }
.missing strong { font-weight: 500; color: ${FG}; }
.missing p { margin-top: 4px; }
.empty { font-size: 14px; color: ${MUTED}; }
.note { border-top: 1px solid ${LINE}; padding-top: 12px; }
.note-text { font-size: 14px; line-height: 1.5; margin-top: 6px; white-space: pre-line; }
.footer { display: flex; justify-content: space-between; font-size: 12px; color: ${MUTED}; }
`;

export function buildReportPdfHtml(input: ReportPdfInput): string {
  const slides = input.sections.flatMap(sectionSlides);
  const total = 1 + Math.max(slides.length, 1);
  const cover = coverHtml(input, 1, total);
  const body = slides.length
    ? slides.map((slide, i) => sectionSlideHtml(slide, input, i + 2, total)).join("\n")
    : `<section class="slide"><p class="empty">Este reporte todavía no tiene secciones.</p>${footerHtml(2, total)}</section>`;

  return `<!doctype html>
<html lang="es-AR">
<head>
<title>${escapeHtml(input.reportName)}</title>
<style>${PDF_CSS}</style>
</head>
<body>
${cover}
${body}
</body>
</html>`;
}
