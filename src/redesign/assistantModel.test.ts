import { describe, expect, it } from "vitest";
import { answerDemoQuestion, type AssistantContext } from "./assistantModel";
import { initialRecords } from "./model";
import { validateQuery } from "@/lib/querySpec";

const context: AssistantContext = { area: "overview", company: "Demo" };
describe("Founder assistant demo", () => {
  it("proposes a private report without modifying the existing records", () => {
    const before = JSON.stringify(initialRecords);
    const response = answerDemoQuestion("Proponé un reporte con mis métricas", context, initialRecords);
    expect(response.proposal?.item.area).toBe("reports");
    expect(response.proposal?.item.fields).toEqual({});
    expect(response.proposal?.item.sections?.[0].blocks.length).toBeGreaterThan(0);
    expect(JSON.stringify(initialRecords)).toBe(before);
  });
  it("prepares a valid metric query and detects an existing definition", () => {
    const response = answerDemoQuestion("Proponé una métrica de ingresos", context, initialRecords);
    expect(validateQuery(response.proposal!.item.query!)).toEqual([]);
    const duplicate = answerDemoQuestion("Proponé una métrica de ingresos", context, [...initialRecords, response.proposal!.item]);
    expect(duplicate.proposal).toBeUndefined();
    expect(duplicate.actions[0]).toMatchObject({ kind: "open", id: response.proposal!.item.id });
  });
  it("preserves an unsaved report and targets the same saved record", () => {
    const report = initialRecords.find(r => r.id === "report1")!;
    const draft = { ...report, name: "Nombre sin guardar", sections: [{ title: "Título sin guardar", subtitle: null, blocks: [{ metric_id: "mrr" }] }] };
    const response = answerDemoQuestion("Agregá NRR", { ...context, area: "reports", record: draft }, initialRecords);
    expect(response.proposal?.original).toEqual(report);
    expect(response.proposal?.item.id).toBe(report.id);
    expect(response.proposal?.item.name).toBe("Nombre sin guardar");
    expect(response.proposal?.item.sections?.[0].blocks).toEqual([{ metric_id: "mrr" }, { metric_id: "nrr" }]);
    expect(answerDemoQuestion("Agregá MRR", { ...context, record: draft }, initialRecords).proposal).toBeUndefined();
  });
  it("reads actual period/scenario and distinguishes unsaved edits", () => {
    const metric = { ...initialRecords[1], entries: { "2026-07:forecast": "42" } };
    const response = answerDemoQuestion("Explicá el valor", { ...context, area: "metrics", record: metric, period: "2026-07", scenario: "forecast", pendingValue: "50" }, initialRecords);
    expect(response.text).toContain("Valor guardado: 42");
    expect(response.text).toContain("Edición sin guardar: 50");
  });
  it("reviews incomplete forms and requires only credential presence, not secrets", () => {
    const response = answerDemoQuestion("Revisá el borrador", { ...context, draft: { area: "metrics", name: "Nueva", category: "Ingresos", detail: "", step: 1, fields: { metric_type: "calculated" }, query: null } }, initialRecords);
    expect(response.text).toContain("Definí la consulta");
    const integration = answerDemoQuestion("Revisá el borrador", { ...context, draft: { area: "settings", name: "Amplitude", category: "Integraciones", detail: "", step: 0, fields: { provider: "amplitude", has_api_key: true, needs_secret: true, has_api_secret: false } } }, initialRecords);
    expect(integration.text).toContain("requiere la clave secreta de ejemplo");
  });
  it("uses active connections and expiry when explaining document access", () => {
    const document = { ...initialRecords.find(r => r.id === "doc2")!, fields: { share_fund1: true, expiry_fund1: "2020-01-01" } };
    expect(answerDemoQuestion("¿Quién puede verlo?", { ...context, area: "documents", record: document }, initialRecords).text).toContain("privado para el equipo");
    expect(answerDemoQuestion("¿Quién puede verlo?", { ...context, area: "documents", record: { ...document, fields: { ...document.fields, is_public: true } } }, initialRecords).text).toContain("todos los fondos conectados");
  });
});
