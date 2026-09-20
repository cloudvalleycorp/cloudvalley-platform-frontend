import { describe, expect, it } from "vitest";
import { reconcileTaskEvidence } from "./reconcileTaskEvidence";
import type { RecordItem } from "./model";

const task: RecordItem = { id: "task", area: "roadmap", name: "Evidencia", category: "Legal", value: "", status: "Pendiente", detail: "", fields: { requires_doc: true, requires_report: true } };
const document: RecordItem = { ...task, id: "doc", area: "documents", fields: { task_id: "task" } };
const fund: RecordItem = { ...task, id: "fund", area: "connections", status: "Conectado", fields: {} };
const report: RecordItem = { ...task, id: "report", area: "reports", fields: { share_fund: true } };

describe("demo roadmap evidence", () => {
  it("accepts either evidence when both types are requested", () => {
    expect(reconcileTaskEvidence([task, document])[0].status).toBe("Completado");
    expect(reconcileTaskEvidence([task, fund, report])[0].status).toBe("Completado");
  });
  it("reopens the task after its document is removed", () => {
    const completed = reconcileTaskEvidence([task, document]);
    const reopened = reconcileTaskEvidence(completed.filter(r => r.id !== "doc"));
    expect(reopened[0].status).toBe("Pendiente");
    expect(reopened[0].fields?.related_document_id).toBe("");
  });
  it("does not count private reports or disconnected recipients", () => {
    expect(reconcileTaskEvidence([task, report])[0].status).toBe("Pendiente");
    expect(reconcileTaskEvidence([task, fund, { ...report, fields: {} }])[0].status).toBe("Pendiente");
    expect(reconcileTaskEvidence([task, { ...fund, status: "Desconectado" }, report])[0].status).toBe("Pendiente");
  });
  it("keeps manual status and avoids repeated state updates", () => {
    const manual = [{ ...task, status: "Completado", fields: {} }];
    expect(reconcileTaskEvidence(manual)).toBe(manual);
    const resolved = reconcileTaskEvidence([task, document]);
    expect(reconcileTaskEvidence(resolved)).toBe(resolved);
  });
});
