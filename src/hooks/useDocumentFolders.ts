import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { handleMembershipError } from "@/lib/membership";
import {
  LIST_DOCUMENT_FOLDERS_URL,
  CREATE_DOCUMENT_FOLDER_URL,
  RENAME_DOCUMENT_FOLDER_URL,
  MOVE_DOCUMENT_FOLDER_URL,
  DELETE_DOCUMENT_FOLDER_URL,
  type DataRoomFolder,
} from "@/lib/dataRoom";

async function fetchFolders(companyId: string): Promise<DataRoomFolder[]> {
  const res = await fetch(`${LIST_DOCUMENT_FOLDERS_URL}?company_id=${encodeURIComponent(companyId)}`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.folders) ? data.folders : [];
}

export type FolderNode = DataRoomFolder & { children: FolderNode[] };

// list-document-folders devuelve una lista plana — el árbol se arma acá,
// una sola vez, para toda la pantalla (breadcrumbs, picker de mover,
// selector de destino al subir).
function buildTree(folders: DataRoomFolder[]): FolderNode[] {
  const byId = new Map<string, FolderNode>(folders.map((f) => [f.id, { ...f, children: [] }]));
  const roots: FolderNode[] = [];
  for (const node of byId.values()) {
    if (node.parent_folder_id && byId.has(node.parent_folder_id)) {
      byId.get(node.parent_folder_id)!.children.push(node);
    } else {
      roots.push(node);
    }
  }
  const sortRec = (nodes: FolderNode[]) => {
    nodes.sort((a, b) => a.order_index - b.order_index || a.name.localeCompare(b.name));
    nodes.forEach((n) => sortRec(n.children));
  };
  sortRec(roots);
  return roots;
}

// Solo founder/equipo de la startup — no hay equivalente de este hook para
// investor a propósito (ver plan: nunca exponer el árbol crudo de carpetas
// al inversor, solo folder_path de lo que ya es visible).
export function useDocumentFolders(companyId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = ["data-room-folders", companyId] as const;

  const { data: folders = [], isLoading: loading } = useQuery({
    queryKey,
    queryFn: () => fetchFolders(companyId!),
    enabled: !!companyId,
  });

  const reload = () => queryClient.invalidateQueries({ queryKey });
  const tree = buildTree(folders);
  const byId = new Map(folders.map((f) => [f.id, f]));
  // Nodos del árbol (con .children ya resueltos) indexados por id — para no
  // tener que recorrer el árbol a mano cada vez que una pantalla necesita
  // "los hijos de la carpeta actual".
  const nodeById = new Map<string, FolderNode>();
  const indexNodes = (nodes: FolderNode[]) => {
    for (const n of nodes) {
      nodeById.set(n.id, n);
      indexNodes(n.children);
    }
  };
  indexNodes(tree);

  // Cadena de ancestros (raíz -> hoja, incluye folderId) — para breadcrumbs.
  const pathTo = (folderId: string | null): DataRoomFolder[] => {
    const path: DataRoomFolder[] = [];
    let current = folderId ? byId.get(folderId) : undefined;
    while (current) {
      path.unshift(current);
      current = current.parent_folder_id ? byId.get(current.parent_folder_id) : undefined;
    }
    return path;
  };

  // Todos los ids descendientes de una carpeta (incluida ella misma) — para
  // que el picker de "mover" no ofrezca mover una carpeta dentro de sí misma
  // o de un hijo suyo (el server igual lo rechaza, esto es solo UX).
  const descendantIds = (folderId: string): Set<string> => {
    const out = new Set<string>([folderId]);
    let added = true;
    while (added) {
      added = false;
      for (const f of folders) {
        if (f.parent_folder_id && out.has(f.parent_folder_id) && !out.has(f.id)) {
          out.add(f.id);
          added = true;
        }
      }
    }
    return out;
  };

  const createFolder = async (name: string, parentFolderId: string | null): Promise<string | null> => {
    if (!companyId) return null;
    try {
      const res = await fetch(CREATE_DOCUMENT_FOLDER_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, name, parent_folder_id: parentFolderId }),
      });
      if (await handleMembershipError(res)) return null;
      if (!res.ok) {
        toast.error("No se pudo crear la carpeta");
        return null;
      }
      const { folder_id } = await res.json();
      toast.success("Carpeta creada");
      reload();
      return folder_id ?? null;
    } catch {
      toast.error("No se pudo crear la carpeta");
      return null;
    }
  };

  const renameFolder = async (folderId: string, name: string): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(RENAME_DOCUMENT_FOLDER_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, folder_id: folderId, name }),
      });
      if (await handleMembershipError(res)) return false;
      if (!res.ok) {
        toast.error("No se pudo renombrar la carpeta");
        return false;
      }
      toast.success("Carpeta renombrada");
      reload();
      return true;
    } catch {
      toast.error("No se pudo renombrar la carpeta");
      return false;
    }
  };

  const moveFolder = async (folderId: string, newParentFolderId: string | null): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(MOVE_DOCUMENT_FOLDER_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, folder_id: folderId, new_parent_folder_id: newParentFolderId }),
      });
      if (await handleMembershipError(res)) return false;
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "No se pudo mover la carpeta");
        return false;
      }
      toast.success("Carpeta movida");
      reload();
      return true;
    } catch {
      toast.error("No se pudo mover la carpeta");
      return false;
    }
  };

  const deleteFolder = async (folderId: string): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(DELETE_DOCUMENT_FOLDER_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, folder_id: folderId }),
      });
      if (await handleMembershipError(res)) return false;
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "No se pudo eliminar la carpeta");
        return false;
      }
      toast.success("Carpeta eliminada");
      reload();
      return true;
    } catch {
      toast.error("No se pudo eliminar la carpeta");
      return false;
    }
  };

  return {
    folders,
    tree,
    byId,
    nodeById,
    loading,
    reload,
    pathTo,
    descendantIds,
    createFolder,
    renameFolder,
    moveFolder,
    deleteFolder,
  };
}
