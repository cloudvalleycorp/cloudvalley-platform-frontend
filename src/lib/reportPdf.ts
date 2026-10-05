// Builder del PDF de un reporte. Devuelve un documento HTML autocontenido:
// sin scripts, sin recursos externos (ni fuentes ni imágenes remotas), CSS
// inline y SVG para los sparklines. El backend lo convierte a PDF, así que
// todo lo que el usuario escribe pasa por escapeHtml.

export type ReportPdfBlock = {
  name: string;
  unit: string | null;
  current: number | null;
  // Variación porcentual frente al período anterior, null si no hay base.
  change: number | null;
  // Serie de 6 períodos, del más viejo al actual. null = sin dato ese mes.
  spark: (number | null)[];
  // Texto que reemplaza al valor cuando no hay dato, ej. "Sin dato en abril 2026".
  missingLabel: string;
};

export type ReportPdfSection = {
  title: string;
  subtitle: string | null;
  blocks: ReportPdfBlock[];
};

export type ReportPdfInput = {
  reportName: string;
  companyName: string;
  // Logo de la startup como data URL (base64). null = monograma con iniciales.
  logoDataUrl?: string | null;
  periodLabel: string;
  generatedLabel: string;
  sections: ReportPdfSection[];
};

const SPARK_COLOR = "#B8402B";

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

export function formatPdfChange(change: number): string {
  const sign = change > 0 ? "+" : "";
  return `${sign}${change.toLocaleString("es-AR", { maximumFractionDigits: 1 })}%`;
}

// Sparkline en SVG. Con un solo punto dibuja un marcador; con valores planos
// (min === max) la línea queda en el medio, nunca divide por cero.
export function sparklineSvg(values: (number | null)[], width = 120, height = 32): string {
  const points = values
    .map((v, i) => (v == null || Number.isNaN(v) ? null : { i, v }))
    .filter((p): p is { i: number; v: number } => p !== null);
  if (points.length === 0) return "";

  const n = values.length;
  const min = Math.min(...points.map((p) => p.v));
  const max = Math.max(...points.map((p) => p.v));
  const span = max - min;
  const x = (i: number) => (n <= 1 ? width / 2 : (i / (n - 1)) * width);
  const y = (v: number) => (span === 0 ? height / 2 : height - ((v - min) / span) * (height - 4) - 2);

  const body =
    points.length === 1
      ? `<circle cx="${x(points[0].i).toFixed(1)}" cy="${y(points[0].v).toFixed(1)}" r="2.5" fill="${SPARK_COLOR}"/>`
      : `<polyline fill="none" stroke="${SPARK_COLOR}" stroke-width="2" stroke-linejoin="round" points="${points
          .map((p) => `${x(p.i).toFixed(1)},${y(p.v).toFixed(1)}`)
          .join(" ")}"/>`;

  return `<svg class="spark" viewBox="0 0 ${width} ${height}" width="${width}" height="${height}" role="img" aria-label="Tendencia de los últimos seis meses">${body}</svg>`;
}

function initialsOf(name: string): string {
  const parts = name.trim().split(/\s+/).filter(Boolean).slice(0, 2);
  if (parts.length === 0) return "?";
  return parts.map((p) => p.charAt(0).toUpperCase()).join("");
}

function renderBlock(block: ReportPdfBlock): string {
  const hasValue = block.current != null && !Number.isNaN(block.current);
  const value = hasValue ? formatPdfNumber(block.current as number) : null;
  const change = block.change != null && !Number.isNaN(block.change) ? block.change : null;
  const changeClass = change == null ? "" : change > 0 ? "up" : change < 0 ? "down" : "flat";
  const unit = block.unit ? ` <span class="unit">${escapeHtml(block.unit)}</span>` : "";

  return `<article class="card">
  <p class="label">${escapeHtml(block.name)}${unit}</p>
  ${value != null ? `<p class="value">${escapeHtml(value)}</p>` : `<p class="missing">${escapeHtml(block.missingLabel)}</p>`}
  ${change != null ? `<p class="change ${changeClass}">${escapeHtml(formatPdfChange(change))} frente al mes anterior</p>` : ""}
  ${sparklineSvg(block.spark)}
</article>`;
}

const PDF_CSS = `
@page { size: A4; margin: 18mm 16mm; }
* { box-sizing: border-box; }
body { margin: 0; color: #1a1a24; font-family: "Helvetica Neue", Arial, sans-serif; font-size: 11pt; line-height: 1.5; background: #ffffff; }
h1 { font-size: 22pt; font-weight: 500; letter-spacing: -0.01em; margin: 0; }
h2 { font-size: 14pt; font-weight: 500; margin: 0; }
p { margin: 0; }
.cover { display: flex; gap: 14px; align-items: center; padding-bottom: 14px; margin-bottom: 18px; border-bottom: 1px solid #d9d9e0; }
.cover > div:last-child { flex: 1; min-width: 0; }
.logo { width: 46px; height: 46px; object-fit: contain; flex-shrink: 0; }
.mono { width: 46px; height: 46px; border-radius: 10px; background: #B8402B; color: #ffffff; display: flex; align-items: center; justify-content: center; font-size: 15pt; font-weight: 500; flex-shrink: 0; }
.kicker { font-size: 9pt; color: #5b5b66; text-transform: uppercase; letter-spacing: 0.06em; margin-bottom: 2px; }
.period { font-size: 11pt; color: #5b5b66; margin-top: 4px; }
.section { margin-bottom: 20px; break-inside: avoid; }
.sub { font-size: 10pt; color: #5b5b66; margin: 4px 0 10px; }
.grid { display: grid; grid-template-columns: 1fr 1fr 1fr; gap: 10px; margin-top: 10px; }
.card { border: 1px solid #d9d9e0; border-radius: 8px; padding: 10px 12px; break-inside: avoid; }
.label { font-size: 9pt; color: #5b5b66; margin-bottom: 4px; }
.unit { color: #5b5b66; }
.value { font-size: 16pt; font-weight: 500; font-variant-numeric: tabular-nums; }
.missing { font-size: 9.5pt; color: #5b5b66; }
.change { font-size: 9pt; margin-top: 2px; font-variant-numeric: tabular-nums; }
.change.up { color: #2A6F3B; }
.change.down { color: #B81466; }
.change.flat { color: #5b5b66; }
.spark { display: block; margin-top: 8px; }
.empty { color: #5b5b66; }
footer { margin-top: 24px; padding-top: 10px; border-top: 1px solid #d9d9e0; font-size: 8.5pt; color: #5b5b66; }
`;

export function buildReportPdfHtml(input: ReportPdfInput): string {
  const sections = input.sections
    .map(
      (section) => `<section class="section">
  <h2>${escapeHtml(section.title)}</h2>
  ${section.subtitle ? `<p class="sub">${escapeHtml(section.subtitle)}</p>` : ""}
  <div class="grid">${section.blocks.map(renderBlock).join("")}</div>
</section>`
    )
    .join("\n");

  return `<!doctype html>
<html lang="es-AR">
<head>
<title>${escapeHtml(input.reportName)}</title>
<style>${PDF_CSS}</style>
</head>
<body>
<header class="cover">
  ${
    input.logoDataUrl
      ? `<img class="logo" src="${escapeHtml(input.logoDataUrl)}" alt="">`
      : `<div class="mono" aria-hidden="true">${escapeHtml(initialsOf(input.companyName))}</div>`
  }
  <div>
    <p class="kicker">${escapeHtml(input.companyName)}</p>
    <h1>${escapeHtml(input.reportName)}</h1>
    <p class="period">${escapeHtml(input.periodLabel)}</p>
  </div>
</header>
${sections || '<p class="empty">Este reporte todavía no tiene secciones.</p>'}
<footer>Generado el ${escapeHtml(input.generatedLabel)}. Los valores corresponden al período fijado en el reporte.</footer>
</body>
</html>`;
}
