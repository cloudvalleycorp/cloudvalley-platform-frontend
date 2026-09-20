export type DemoFolder = { id: string; name: string; parentId: string | null; fields?: Record<string, string | boolean> };
export const folderKey = "cloudvalley-redesign-folders";
export function readFolders(): DemoFolder[] {
  try { const rows = JSON.parse(localStorage.getItem(folderKey) || "null"); if (Array.isArray(rows) && rows.every(r => typeof r.id === "string" && typeof r.name === "string" && (r.parentId === null || typeof r.parentId === "string"))) return rows; } catch { /* Default catalog. */ }
  return [{ id: "fundraising", name: "Fundraising", parentId: null }, { id: "finances", name: "Finanzas", parentId: null }, { id: "legal", name: "Legal", parentId: null }];
}
function openDatabase(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => { const request = indexedDB.open("cloudvalley-redesign-files", 1); request.onupgradeneeded = () => request.result.createObjectStore("files"); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); });
}
export async function storeFile(id: string, file: File) {
  const db = await openDatabase();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").put(file, id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); tx.onabort = () => reject(tx.error); }); } finally { db.close(); }
}
export async function readFile(id: string): Promise<File | undefined> {
  const db = await openDatabase();
  try { return await new Promise((resolve, reject) => { const request = db.transaction("files").objectStore("files").get(id); request.onsuccess = () => resolve(request.result); request.onerror = () => reject(request.error); }); } finally { db.close(); }
}
export async function removeFile(id: string) {
  const db = await openDatabase();
  try { await new Promise<void>((resolve, reject) => { const tx = db.transaction("files", "readwrite"); tx.objectStore("files").delete(id); tx.oncomplete = () => resolve(); tx.onerror = () => reject(tx.error); }); } finally { db.close(); }
}
