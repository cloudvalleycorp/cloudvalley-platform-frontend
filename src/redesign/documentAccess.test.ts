import { describe, expect, it } from "vitest";
import { documentAccess, folderOf } from "./documentAccess";
import type { DemoFolder } from "./localDocuments";
import type { RecordItem } from "./model";

const fund: RecordItem = { id: "fund", area: "connections", name: "Fondo", category: "", detail: "", status: "Conectado", value: "" };
const document: RecordItem = { ...fund, id: "doc", area: "documents", fields: { folder_id: "child" } };
const folders: DemoFolder[] = [{ id: "parent", name: "Compartida", parentId: null, fields: { share_fund: true } }, { id: "child", name: "Subcarpeta", parentId: "parent" }];
describe("document permissions in the Founder demo", () => {
  it("inherits ancestor permissions for existing and newly added documents", () => {
    expect(documentAccess(document, [fund], folders)[0].folders.map(f => f.id)).toEqual(["parent"]);
    expect(documentAccess({ ...document, id: "new" }, [fund], folders)).toHaveLength(1);
  });
  it("loses inherited access when moved out, while keeping direct access", () => {
    const moved = { ...document, fields: { folder_id: "" } };
    expect(documentAccess(moved, [fund], folders)).toHaveLength(0);
    expect(documentAccess({ ...moved, fields: { folder_id: "", share_fund: true } }, [fund], folders)[0].direct).toBe(true);
  });
  it("does not confuse a root destination with a legacy category", () => {
    expect(folderOf({ ...document, category: "Finanzas", fields: { folder_id: "" } })).toBe("");
  });
  it("requires an active connection and valid expiry, and handles cyclic folders", () => {
    const expired = folders.map(f => f.id === "parent" ? { ...f, parentId: "child", fields: { share_fund: true, expiry_fund: "2020-01-01" } } : f);
    expect(documentAccess(document, [fund], expired, Date.parse("2026-09-20"))).toHaveLength(0);
    expect(documentAccess(document, [{ ...fund, status: "Desconectado" }], folders)).toHaveLength(0);
    expect(documentAccess({ ...document, fields: { ...document.fields, is_public: true } }, [fund], expired)).toHaveLength(1);
  });
});
