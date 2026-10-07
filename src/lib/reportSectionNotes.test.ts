import { describe, it, expect } from "vitest";
import type { ObservabilityTraceEntry } from "@/lib/aiInsights";
import {
  PROPOSE_SECTION_NOTES_TOOL,
  SECTION_NOTES_TOOL,
  sectionNoteProposals,
  sectionNotesFieldsFromProposal,
  sectionNotesSaveOutcome,
} from "@/lib/reportSectionNotes";

const proposal = {
  report_id: "r-1",
  section_index: 2,
  notes: "El MRR creció por el plan anual.",
  section_title: "Ingresos",
  expected_updated_at: "2026-10-05T10:00:00Z",
};

function entry(tool: string, result: Record<string, unknown>): ObservabilityTraceEntry {
  return { tool, result };
}

describe("sectionNotesFieldsFromProposal", () => {
  it("reenvía exactamente los campos de la propuesta", () => {
    expect(sectionNotesFieldsFromProposal(proposal)).toEqual(proposal);
  });

  it("sin report_id no hay nada que confirmar", () => {
    expect(sectionNotesFieldsFromProposal({ ...proposal, report_id: "" })).toBeNull();
  });

  it("section_index tiene que ser un entero, no un texto", () => {
    expect(sectionNotesFieldsFromProposal({ ...proposal, section_index: "2" })).toBeNull();
    expect(sectionNotesFieldsFromProposal({ ...proposal, section_index: 1.5 })).toBeNull();
  });

  it("notes ausente o no-texto queda en null, nunca en un string inventado", () => {
    const fields = sectionNotesFieldsFromProposal({ ...proposal, notes: undefined });
    expect(fields?.notes).toBeNull();
  });
});

describe("sectionNoteProposals", () => {
  it("toma las propuestas con status proposed de propose-section-notes", () => {
    const trace = [
      entry("list-metrics", { status: "ok" }),
      entry(PROPOSE_SECTION_NOTES_TOOL, { status: "proposed", ...proposal }),
      entry("upsert-metric-definition", { status: "pending_confirmation", proposed: { name: "Churn" } }),
    ];
    const found = sectionNoteProposals(trace);
    expect(found).toHaveLength(1);
    expect(found[0].index).toBe(1);
    expect(found[0].fields.report_id).toBe("r-1");
  });

  it("acepta los campos dentro de result.proposed (forma después del push)", () => {
    const found = sectionNoteProposals([entry(PROPOSE_SECTION_NOTES_TOOL, { status: "proposed", proposed: proposal })]);
    expect(found).toHaveLength(1);
    expect(found[0].fields.section_index).toBe(2);
  });

  it("needs_section y error no generan tarjeta de propuesta", () => {
    const trace = [
      entry(PROPOSE_SECTION_NOTES_TOOL, { status: "needs_section", sections: [] }),
      entry(PROPOSE_SECTION_NOTES_TOOL, { status: "error" }),
    ];
    expect(sectionNoteProposals(trace)).toEqual([]);
  });

  it("set-report-section-notes nunca genera una propuesta: solo confirma", () => {
    const trace = [entry(SECTION_NOTES_TOOL, { status: "pending_confirmation", ...proposal })];
    expect(sectionNoteProposals(trace)).toEqual([]);
  });
});

describe("sectionNotesSaveOutcome", () => {
  it("null si la traza no tiene ningún set-report-section-notes", () => {
    expect(sectionNotesSaveOutcome([entry(PROPOSE_SECTION_NOTES_TOOL, { status: "proposed" })])).toBeNull();
  });

  it("saved: quedó en el borrador", () => {
    expect(sectionNotesSaveOutcome([entry(SECTION_NOTES_TOOL, { status: "saved" })])).toEqual({ kind: "saved" });
  });

  it("conflict: el reporte cambió desde la propuesta", () => {
    expect(sectionNotesSaveOutcome([entry(SECTION_NOTES_TOOL, { status: "conflict" })])).toEqual({ kind: "conflict" });
  });

  it("forbidden: solo el dueño de la startup puede guardar", () => {
    expect(sectionNotesSaveOutcome([entry(SECTION_NOTES_TOOL, { status: "forbidden" })])).toEqual({ kind: "forbidden" });
  });

  it("pending_confirmation: no se guardó nada", () => {
    expect(sectionNotesSaveOutcome([entry(SECTION_NOTES_TOOL, { status: "pending_confirmation" })])).toEqual({ kind: "pending" });
  });

  it("cualquier otro estado, incluido error, cuenta como no guardado", () => {
    expect(sectionNotesSaveOutcome([entry(SECTION_NOTES_TOOL, { status: "error" })])).toEqual({ kind: "error" });
  });

  it("usa la última entrada de set-report-section-notes de la traza", () => {
    const trace = [entry(SECTION_NOTES_TOOL, { status: "conflict" }), entry(SECTION_NOTES_TOOL, { status: "saved" })];
    expect(sectionNotesSaveOutcome(trace)).toEqual({ kind: "saved" });
  });
});
