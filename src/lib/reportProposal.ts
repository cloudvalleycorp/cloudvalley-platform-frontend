import type { ObservabilityTraceEntry, ReportProposal } from "@/lib/aiInsights";

// Propuesta de create-report-from-proposal (contrato 2026-10). El backend ya no
// crea el reporte en el primer turno: devuelve pending_confirmation con
// result.proposed, y el frontend crea recién cuando el usuario confirma.

function asString(v: unknown): string | undefined {
  return typeof v === "string" && v.trim() ? v : undefined;
}

function asRecord(v: unknown): Record<string, unknown> | undefined {
  return v && typeof v === "object" && !Array.isArray(v) ? (v as Record<string, unknown>) : undefined;
}

export function reportProposals(trace: ObservabilityTraceEntry[]): { index: number; proposal: ReportProposal }[] {
  return trace.flatMap((entry, index) => {
    if (entry.tool !== "create-report-from-proposal" || entry.result?.status !== "pending_confirmation") return [];
    const proposed = asRecord(entry.result?.proposed);
    const name = asString(proposed?.name);
    const period = asString(proposed?.period);
    if (!name || !period) return [];
    const rawSections = proposed?.sections;
    const sections = Array.isArray(rawSections)
      ? rawSections.map((s) => {
          const section = asRecord(s);
          const metricIds = Array.isArray(section?.metric_ids)
            ? section.metric_ids.filter((id): id is string => typeof id === "string")
            : [];
          return { title: asString(section?.title) ?? "", metric_ids: metricIds };
        })
      : [];
    return [{ index, proposal: { name, period, sections } }];
  });
}

// Mensajes que no tienen tarjeta propia pero hay que mostrar. El pedido ambiguo
// (pending_clarification) no entra acá: su pregunta ya viene en el texto de
// answer, repetirla sería duplicarla.
export function reportNotes(trace: ObservabilityTraceEntry[]): string[] {
  return trace.flatMap((entry) => {
    if (entry.tool !== "create-report-from-proposal") return [];
    if (entry.result?.status === "forbidden") {
      return ["Solo el dueño de la startup puede crear reportes desde el asistente."];
    }
    return [];
  });
}
