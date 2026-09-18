import { useEffect, useRef } from "react";
import { TRACK_REPORT_VIEW_EVENT_URL, type ReportViewEventType } from "@/lib/financialReports";

const HEARTBEAT_INTERVAL_MS = 20_000;

// % de la página ya scrolleada — no hay un contenedor scrolleable propio
// para el contenido del reporte (es scroll de página completa), así que se
// mide contra el documento entero. 100 cuando la página no scrollea (todo
// el contenido ya está a la vista).
function currentScrollPct(): number {
  const scrollable = document.documentElement.scrollHeight - window.innerHeight;
  if (scrollable <= 0) return 100;
  return Math.min(100, Math.max(0, Math.round((window.scrollY / scrollable) * 100)));
}

function sendEvent(reportId: string, eventType: ReportViewEventType, extra?: { active_seconds?: number; scroll_pct?: number }, keepalive = false) {
  try {
    void fetch(TRACK_REPORT_VIEW_EVENT_URL, {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ report_id: reportId, event_type: eventType, ...extra }),
      keepalive,
    });
  } catch {
    // best-effort — nunca bloquear ni avisar al founder/inversor por esto,
    // es telemetría, no una acción que el usuario haya pedido.
  }
}

// Instrumenta el visor de UN reporte compartido (lado inversor, o founder/
// admin viendo su propia vista previa): manda "open" al mostrarse, "heartbeat"
// cada 20s con el tiempo activo real (pestaña visible Y con foco, nunca de
// fondo) desde el heartbeat anterior + el % de scroll actual, y "close" al
// dejar de verlo. Reemplaza el viejo "Marcar revisado" manual — el backend
// calcula solo el estado de lectura a partir de estos eventos.
export function useReportViewTracking(reportId: string | null) {
  const activeSecondsRef = useRef(0);

  useEffect(() => {
    if (!reportId) return;
    activeSecondsRef.current = 0;
    sendEvent(reportId, "open");

    const tick = setInterval(() => {
      if (document.visibilityState === "visible" && document.hasFocus()) {
        activeSecondsRef.current += 1;
      }
    }, 1000);

    const flush = () => {
      if (activeSecondsRef.current <= 0) return;
      sendEvent(reportId, "heartbeat", { active_seconds: activeSecondsRef.current, scroll_pct: currentScrollPct() });
      activeSecondsRef.current = 0;
    };
    const heartbeat = setInterval(flush, HEARTBEAT_INTERVAL_MS);

    const handlePageHide = () => {
      flush();
      sendEvent(reportId, "close", undefined, true);
    };
    window.addEventListener("pagehide", handlePageHide);

    return () => {
      clearInterval(tick);
      clearInterval(heartbeat);
      window.removeEventListener("pagehide", handlePageHide);
      flush();
      sendEvent(reportId, "close");
    };
  }, [reportId]);
}
