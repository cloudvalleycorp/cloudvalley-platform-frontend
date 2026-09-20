import { readFolders, type DemoFolder } from "./localDocuments";
import type { RecordItem } from "./model";

export function folderOf(item: RecordItem) { return String(item.fields?.folder_id ?? ({ Finanzas: "finances", Legal: "legal", Fundraising: "fundraising" }[item.category] || "")); }
export function folderAncestors(id: string, folders: DemoFolder[]) {
  const result: DemoFolder[] = []; const visited = new Set<string>();
  let cursor = id;
  while (cursor && !visited.has(cursor)) { visited.add(cursor); const folder = folders.find(f => f.id === cursor); if (!folder) break; result.push(folder); cursor = folder.parentId || ""; }
  return result;
}
function shared(fields: Record<string, string | boolean> | undefined, fundId: string, now: number) {
  if (!fields?.[`share_${fundId}`]) return false;
  const expiry = fields[`expiry_${fundId}`];
  return !expiry || new Date(`${expiry}T23:59:59`).getTime() >= now;
}
export function documentAccess(item: RecordItem, records: RecordItem[], folders = readFolders(), now = Date.now()) {
  const ancestors = folderAncestors(folderOf(item), folders);
  return records.filter(r => r.area === "connections" && r.status === "Conectado").flatMap(fund => {
    const inherited = ancestors.filter(folder => shared(folder.fields, fund.id, now));
    const direct = shared(item.fields, fund.id, now);
    return item.fields?.is_public || direct || inherited.length ? [{ fund, direct, public: !!item.fields?.is_public, folders: inherited }] : [];
  });
}
export function documentAccessLabel(item: RecordItem, records: RecordItem[], folders = readFolders()) { return item.fields?.is_public ? "Visible para conectados" : documentAccess(item, records, folders).length ? "Compartido" : "Privado"; }
