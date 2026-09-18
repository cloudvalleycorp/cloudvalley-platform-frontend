import { TRACK_DOCUMENT_VIEW_EVENT_URL, type DocumentViewEventType } from "@/lib/dataRoom";

// Mucho más simple que useReportViewTracking.ts (sin heartbeat/scroll): un
// documento se abre con window.open a una signed URL de GCS en una pestaña
// aparte, sin DOM propio para medir foco/scroll real — ver el plan. Son dos
// eventos puntuales, disparados al click, best-effort (nunca bloquean ni
// avisan error al usuario si fallan).
function track(documentId: string, eventType: DocumentViewEventType) {
  fetch(TRACK_DOCUMENT_VIEW_EVENT_URL, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ document_id: documentId, event_type: eventType }),
  }).catch(() => {
    // silencioso — telemetría best-effort, nunca bloquea al usuario
  });
}

export function useDocumentViewTracking() {
  const trackOpen = (documentId: string) => track(documentId, "open");
  const trackDownload = (documentId: string) => track(documentId, "download");
  return { trackOpen, trackDownload };
}
