import type { DataRoomDocument } from "@/lib/dataRoom";

export type DataRoomTreeNode = { id: string; name: string; children: DataRoomTreeNode[] };

// Sentinel de UI para el bucket de documentos legacy (folder_path vacío o
// ausente) — nunca se manda al backend, mismo criterio que el UNCATEGORIZED
// de DataRoom.tsx (founder), pero acá TODO documento legacy va a un único
// bucket raíz en vez de uno por categoría vieja (esa es la simplificación
// de comportamiento aprobada en el mockup).
export const ROOT_LEGACY_ID = "__uncategorized__";

// Arma el árbol 100% a partir de folder_path (nunca list-document-folders,
// ese endpoint sigue siendo founder/team-only a propósito — el investor
// arma su árbol solo con las carpetas de documentos que ya puede ver).
export function buildDataRoomTree(documents: DataRoomDocument[]): {
  tree: DataRoomTreeNode[];
  docsByFolderId: Map<string, DataRoomDocument[]>;
} {
  const nodeById = new Map<string, DataRoomTreeNode>();
  const roots: DataRoomTreeNode[] = [];
  const docsByFolderId = new Map<string, DataRoomDocument[]>();

  const ensureNode = (id: string, name: string, parentId: string | null): DataRoomTreeNode => {
    const existing = nodeById.get(id);
    if (existing) return existing;
    const node: DataRoomTreeNode = { id, name, children: [] };
    nodeById.set(id, node);
    if (parentId) {
      nodeById.get(parentId)?.children.push(node);
    } else {
      roots.push(node);
    }
    return node;
  };

  const addDoc = (folderId: string, doc: DataRoomDocument) => {
    const list = docsByFolderId.get(folderId);
    if (list) list.push(doc);
    else docsByFolderId.set(folderId, [doc]);
  };

  for (const doc of documents) {
    const path = doc.folder_path;
    if (!path || path.length === 0) {
      addDoc(ROOT_LEGACY_ID, doc);
      continue;
    }
    let parentId: string | null = null;
    for (const segment of path) {
      ensureNode(segment.id, segment.name, parentId);
      parentId = segment.id;
    }
    addDoc(path[path.length - 1].id, doc);
  }

  return { tree: roots, docsByFolderId };
}

// Cadena de ancestros raíz→hoja hasta folderId (incluido) — para el
// breadcrumb. folderId null = raíz, cadena vacía.
export function pathTo(tree: DataRoomTreeNode[], folderId: string | null): DataRoomTreeNode[] {
  if (!folderId) return [];
  const stack: DataRoomTreeNode[] = [];
  const visit = (nodes: DataRoomTreeNode[]): boolean => {
    for (const node of nodes) {
      stack.push(node);
      if (node.id === folderId || visit(node.children)) return true;
      stack.pop();
    }
    return false;
  };
  visit(tree);
  return stack;
}

export function findNode(tree: DataRoomTreeNode[], folderId: string): DataRoomTreeNode | null {
  for (const node of tree) {
    if (node.id === folderId) return node;
    const found = findNode(node.children, folderId);
    if (found) return found;
  }
  return null;
}
