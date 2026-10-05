import { EXPORT_REPORT_PDF_URL, type ExportReportPdfResponse } from "@/lib/financialReports";

// Contrato export-report-pdf: POST { report_id, html } → { download_url }.
// El HTML lo arma reportPdf.ts en el frontend; el backend solo lo convierte.
export const MAX_REPORT_PDF_HTML_BYTES = 2 * 1024 * 1024;

export const PDF_TOO_HEAVY_MESSAGE =
  "El PDF quedó demasiado pesado. Quitá una sección o una métrica con mucho historial y probá de nuevo.";
export const PDF_FAILED_MESSAGE = "No pudimos generar el PDF. Probá de nuevo en un minuto.";

export type ExportReportPdfResult = { ok: true; downloadUrl: string } | { ok: false; message: string };

export const MAX_LOGO_BYTES = 400 * 1024;

// El renderizador del backend responde 500 cuando el HTML trae un <img> con data
// URL (probado en vivo: el mismo HTML sin imagen genera el PDF). Mientras eso no
// esté resuelto, el PDF sale con el monograma. Cambiar a true cuando el backend
// confirme que acepta imágenes embebidas.
export const PDF_LOGO_SUPPORTED_BY_BACKEND = true;

// Descarga el logo de la startup y lo devuelve como data URL, para que el PDF no
// dependa de URLs externas. Cualquier fallo (sin logo, red, formato, tamaño)
// devuelve null: el PDF sale con el monograma y no se bloquea por el logo.
export async function loadLogoDataUrl(url: string | null | undefined): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url, { credentials: "omit" });
    if (!res.ok) return null;
    const blob = await res.blob();
    if (!blob.type.startsWith("image/") || blob.size > MAX_LOGO_BYTES) return null;
    const small = await shrinkToDataUrl(blob);
    if (small) return small;
    return await blobToDataUrl(blob);
  } catch {
    return null;
  }
}

// El logo se ve a 46 px en el PDF: se reduce a 192 px para que el HTML no pese
// medio megabyte de base64. Si el navegador no puede decodificar la imagen,
// devuelve null y se usa el original.
async function shrinkToDataUrl(blob: Blob): Promise<string | null> {
  if (typeof createImageBitmap !== "function" || typeof document === "undefined") return null;
  try {
    const bitmap = await createImageBitmap(blob);
    const side = 192;
    const scale = Math.min(side / bitmap.width, side / bitmap.height, 1);
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(bitmap.width * scale);
    canvas.height = Math.round(bitmap.height * scale);
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;
    ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close?.();
    return canvas.toDataURL("image/png");
  } catch {
    return null;
  }
}

function blobToDataUrl(blob: Blob): Promise<string | null> {
  return new Promise((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(typeof reader.result === "string" ? reader.result : null);
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(blob);
  });
}

export function htmlByteLength(html: string): number {
  return new TextEncoder().encode(html).length;
}

export async function exportReportPdf(reportId: string, html: string): Promise<ExportReportPdfResult> {
  if (htmlByteLength(html) > MAX_REPORT_PDF_HTML_BYTES) {
    return { ok: false, message: PDF_TOO_HEAVY_MESSAGE };
  }
  try {
    const res = await fetch(EXPORT_REPORT_PDF_URL, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_id: reportId, html }),
    });
    if (res.status === 413) return { ok: false, message: PDF_TOO_HEAVY_MESSAGE };
    if (!res.ok) return { ok: false, message: PDF_FAILED_MESSAGE };
    const data = (await res.json()) as ExportReportPdfResponse;
    if (!data?.download_url) return { ok: false, message: PDF_FAILED_MESSAGE };
    return { ok: true, downloadUrl: data.download_url };
  } catch {
    return { ok: false, message: PDF_FAILED_MESSAGE };
  }
}
