import { describe, expect, it } from "vitest";
import { applySourcePreview, previewSource, sourceRawFields } from "./sourceSimulation";
import { initialRecords } from "./model";

const source = initialRecords.find(r => r.id === "eerr")!;
describe("local source import", () => {
  it("previews without mutating and remains idempotent after import", () => {
    const snapshot = JSON.stringify(source);
    const preview = previewSource(source);
    expect(preview.result.inserted_rows).toBe(3);
    expect(JSON.stringify(source)).toBe(snapshot);
    const saved = applySourcePreview(source, preview);
    expect(saved.sourceRows).toHaveLength(3);
    expect(saved.sourceRuns).toHaveLength(1);
    expect(previewSource(saved).result.inserted_rows).toBe(0);
    expect(previewSource(saved).result.updated_rows).toBe(0);
  });
  it("keeps previous data and timestamps after an import failure", () => {
    const saved = applySourcePreview(source, previewSource(source), "2026-09-20T15:00:00Z");
    const failed = applySourcePreview(saved, previewSource(saved, "schema"), "2026-09-20T16:00:00Z");
    expect(failed.sourceRows).toEqual(saved.sourceRows);
    expect(failed.fields?.last_synced_at).toBe("2026-09-20T15:00:00Z");
    expect(failed.sourceRuns?.[0].result.status).toBe("error");
  });
  it("preserves existing values for rejected rows in a partial import", () => {
    const saved = applySourcePreview(source, previewSource(source));
    saved.sourceRows![1].values.ingresos = "123";
    const preview = previewSource(saved, "partial");
    expect(preview.result.rows_rejected).toBe(1);
    const partial = applySourcePreview(saved, preview);
    expect(partial.sourceRows?.find(row => row.period === "2026-07")?.values.ingresos).toBe("123");
    expect(partial.status).toBe("Revisar");
  });
  it("exposes custom field keys and respects grid period axes", () => {
    const grid = { ...source, fields: { structure: "grid", concept_axis: JSON.stringify([{ label: "Ingresos", suggested_field_key: "revenue_custom", value_type: "number" }]), period_axis: JSON.stringify([{ period: "2026-08" }]) } };
    expect(sourceRawFields([grid])[0].field_key).toBe("revenue_custom");
    expect(previewSource(grid).rows).toEqual([{ period: "2026-08", values: { revenue_custom: "101000" } }]);
  });
});
