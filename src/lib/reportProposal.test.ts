import { describe, it, expect } from "vitest";
import type { ObservabilityTraceEntry } from "@/lib/aiInsights";
import { reportNotes, reportProposals } from "@/lib/reportProposal";

const proposalEntry: ObservabilityTraceEntry = {
  tool: "create-report-from-proposal",
  result: {
    status: "pending_confirmation",
    message: "El reporte no se crea sin que confirmes el nombre y el período.",
    proposed: {
      name: "Board abril 2026",
      period: "2026-04",
      sections: [
        { title: "Ingresos", metric_ids: ["revenue", "mrr"] },
        { title: "Clientes", metric_ids: ["customers"] },
      ],
    },
  },
};

describe("reportProposals", () => {
  it("extrae nombre, período y secciones de una propuesta pendiente", () => {
    const [found] = reportProposals([proposalEntry]);
    expect(found.index).toBe(0);
    expect(found.proposal).toEqual({
      name: "Board abril 2026",
      period: "2026-04",
      sections: [
        { title: "Ingresos", metric_ids: ["revenue", "mrr"] },
        { title: "Clientes", metric_ids: ["customers"] },
      ],
    });
  });

  it("un reporte ya creado no es una propuesta pendiente", () => {
    const created: ObservabilityTraceEntry = {
      tool: "create-report-from-proposal",
      result: { status: "created", report_id: "r1", name: "Board", period: "2026-04", sections: [] },
    };
    expect(reportProposals([created])).toEqual([]);
  });

  it("una propuesta de métrica no entra como propuesta de reporte", () => {
    const metric: ObservabilityTraceEntry = {
      tool: "upsert-metric-definition",
      result: { status: "pending_confirmation", proposed: { name: "Churn", metric_type: "calculated" } },
    };
    expect(reportProposals([metric])).toEqual([]);
  });

  it("sin nombre o sin período no hay tarjeta que confirmar", () => {
    const noPeriod: ObservabilityTraceEntry = {
      tool: "create-report-from-proposal",
      result: { status: "pending_confirmation", proposed: { name: "Board", sections: [] } },
    };
    const noName: ObservabilityTraceEntry = {
      tool: "create-report-from-proposal",
      result: { status: "pending_confirmation", proposed: { period: "2026-04", sections: [] } },
    };
    expect(reportProposals([noPeriod, noName])).toEqual([]);
  });

  it("una sección sin título llega vacía y no rompe el parseo", () => {
    const entry: ObservabilityTraceEntry = {
      tool: "create-report-from-proposal",
      result: {
        status: "pending_confirmation",
        proposed: { name: "Board", period: "2026-04", sections: [{ metric_ids: ["revenue"] }] },
      },
    };
    expect(reportProposals([entry])[0].proposal.sections).toEqual([{ title: "", metric_ids: ["revenue"] }]);
  });
});

describe("reportNotes", () => {
  it("sin permiso explica quién puede crear el reporte", () => {
    const forbidden: ObservabilityTraceEntry = { tool: "create-report-from-proposal", result: { status: "forbidden" } };
    expect(reportNotes([forbidden])).toEqual(["Solo el dueño de la startup puede crear reportes desde el asistente."]);
  });

  it("el pedido ambiguo no repite texto: su pregunta ya viene en answer", () => {
    const clarification: ObservabilityTraceEntry = {
      tool: "create-report-from-proposal",
      result: { status: "pending_clarification", clarification_needed: "period" },
    };
    expect(reportNotes([clarification])).toEqual([]);
  });
});
