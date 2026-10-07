import type { ObservabilityTraceEntry } from "@/lib/aiInsights";

// propose-section-notes propone el texto de la nota. La nota generada por IA es
// solo una propuesta: no se guarda hasta que la persona la confirma con
// set-report-section-notes.
export const PROPOSE_SECTION_NOTES_TOOL = "propose-section-notes";
export const SECTION_NOTES_TOOL = "set-report-section-notes";

// Campos que el confirm reenvía tal cual vinieron en la propuesta. Sin
// section_title ni expected_updated_at el backend no guarda (responde error).
export type SectionNotesFields = {
  report_id: string;
  section_index: number;
  notes: string | null;
  section_title: string | null;
  expected_updated_at: string | null;
};

export type SectionNoteProposal = {
  index: number;
  fields: SectionNotesFields;
};

// Resultado del último set-report-section-notes de la traza. "pending" es una
// confirmación sin write: no se guardó nada.
export type SectionNotesSaveOutcome =
  | { kind: "saved" }
  | { kind: "conflict" }
  | { kind: "forbidden" }
  | { kind: "pending" }
  | { kind: "error" };

// null si falta report_id o section_index: sin eso no hay nada que confirmar.
export function sectionNotesFieldsFromProposal(proposed: Record<string, unknown>): SectionNotesFields | null {
  const reportId = typeof proposed.report_id === "string" && proposed.report_id ? proposed.report_id : null;
  const sectionIndex =
    typeof proposed.section_index === "number" && Number.isInteger(proposed.section_index) ? proposed.section_index : null;
  if (!reportId || sectionIndex === null) return null;
  return {
    report_id: reportId,
    section_index: sectionIndex,
    notes: typeof proposed.notes === "string" ? proposed.notes : null,
    section_title: typeof proposed.section_title === "string" ? proposed.section_title : null,
    expected_updated_at: typeof proposed.expected_updated_at === "string" ? proposed.expected_updated_at : null,
  };
}

// Propuestas con status "proposed". Hoy los campos vienen planos en el resultado;
// después del push pendiente vienen dentro de result.proposed. Se aceptan las dos
// formas. needs_section y error no generan tarjeta: la respuesta del agente ya lo explica.
export function sectionNoteProposals(trace: ObservabilityTraceEntry[]): SectionNoteProposal[] {
  return trace.flatMap((entry, index) => {
    if (entry.tool !== PROPOSE_SECTION_NOTES_TOOL || entry.result?.status !== "proposed") return [];
    const nested = entry.result.proposed;
    const fromNested =
      typeof nested === "object" && nested !== null ? sectionNotesFieldsFromProposal(nested as Record<string, unknown>) : null;
    const fields = fromNested ?? sectionNotesFieldsFromProposal(entry.result);
    return fields ? [{ index, fields }] : [];
  });
}

// Estado del último set-report-section-notes de la traza. null si la traza no
// tiene ninguna entrada de ese tool.
export function sectionNotesSaveOutcome(trace: ObservabilityTraceEntry[]): SectionNotesSaveOutcome | null {
  const entry = [...trace].reverse().find((e) => e.tool === SECTION_NOTES_TOOL);
  if (!entry) return null;
  switch (entry.result?.status) {
    case "saved":
      return { kind: "saved" };
    case "conflict":
      return { kind: "conflict" };
    case "forbidden":
      return { kind: "forbidden" };
    case "pending_confirmation":
      return { kind: "pending" };
    default:
      return { kind: "error" };
  }
}

// Lo que se le dice a la persona según el resultado. "saved" es el único caso
// que puede decir que la nota quedó guardada.
export const SECTION_NOTES_OUTCOME_TEXT: Record<SectionNotesSaveOutcome["kind"], string> = {
  saved: "Nota guardada en el borrador. La versión publicada no cambia hasta que publiques.",
  conflict: "El reporte cambió desde que se propuso esta nota, así que no la guardé. Pedí una nueva propuesta para revisar la versión actual.",
  forbidden: "Solo el dueño de la startup puede guardar notas.",
  pending: "La nota todavía no se guardó. Confirmala de nuevo para guardarla.",
  error: "No pudimos guardar la nota. Probá de nuevo desde una nueva propuesta.",
};

// Cuando la traza no trae ningún set-report-section-notes.
export const SECTION_NOTES_ERROR_TEXT = SECTION_NOTES_OUTCOME_TEXT.error;
