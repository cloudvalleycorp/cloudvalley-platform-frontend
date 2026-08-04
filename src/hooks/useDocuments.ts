import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import { handleMembershipError } from "@/lib/membership";
import {
  LIST_DOCUMENTS_URL,
  CREATE_DOCUMENT_URL,
  GET_DOCUMENT_UPLOAD_URL,
  CONFIRM_DOCUMENT_UPLOAD_URL,
  DELETE_DOCUMENT_URL,
  UPDATE_DOCUMENT_PRIVACY_URL,
  LINK_DOCUMENT_TASK_URL,
  SET_DOCUMENT_VERIFIED_URL,
  type DataRoomDocument,
  type DocumentCategory,
} from "@/lib/dataRoom";

async function fetchDocuments(companyId: string): Promise<DataRoomDocument[]> {
  const res = await fetch(`${LIST_DOCUMENTS_URL}?company_id=${encodeURIComponent(companyId)}`, {
    credentials: "include",
  });
  if (!res.ok) return [];
  const data = await res.json();
  return Array.isArray(data?.documents) ? data.documents : [];
}

/**
 * Data layer de Data Room — habla exclusivamente con el gateway de Cloud
 * Functions (nunca Supabase, ver el plan). No va a devolver datos reales
 * hasta que backend despliegue los endpoints pedidos (list-documents,
 * create-document, get/confirm-document-upload-url, delete-document,
 * update-document-privacy, link-document-task, set-document-verified).
 */
export function useDocuments(companyId: string | null) {
  const queryClient = useQueryClient();
  const queryKey = ["data-room-documents", companyId] as const;

  const { data: documents = [], isLoading: loading } = useQuery({
    queryKey,
    queryFn: () => fetchDocuments(companyId!),
    enabled: !!companyId,
  });

  const reload = () => queryClient.invalidateQueries({ queryKey });

  const setLocalDocs = (updater: (prev: DataRoomDocument[]) => DataRoomDocument[]) => {
    queryClient.setQueryData<DataRoomDocument[]>(queryKey, (prev) => updater(prev ?? []));
  };

  /** Crea el documento y sube el archivo en un solo paso (usado por "Agregar documento"). */
  const createAndUpload = async (
    category: DocumentCategory,
    name: string,
    file: File,
    taskId: string | null,
    isPublic: boolean
  ): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const createRes = await fetch(CREATE_DOCUMENT_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, category, name, task_id: taskId, is_public: isPublic }),
      });
      if (await handleMembershipError(createRes)) return false;
      const { document_id } = await createRes.json();
      const ok = await uploadFile(document_id, file);
      if (ok) reload();
      return ok;
    } catch {
      toast.error("No se pudo crear el documento");
      return false;
    }
  };

  /** Sube (o reemplaza) el archivo de un documento ya creado. */
  const uploadFile = async (documentId: string, file: File): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const urlRes = await fetch(GET_DOCUMENT_UPLOAD_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          document_id: documentId,
          file_name: file.name,
          content_type: file.type || "application/octet-stream",
        }),
      });
      if (await handleMembershipError(urlRes)) return false;
      const { upload_url, storage_path } = await urlRes.json();

      const putRes = await fetch(upload_url, { method: "PUT", body: file });
      if (!putRes.ok) {
        toast.error("No se pudo subir el archivo");
        return false;
      }

      const confirmRes = await fetch(CONFIRM_DOCUMENT_UPLOAD_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, document_id: documentId, storage_path }),
      });
      if (await handleMembershipError(confirmRes)) return false;
      toast.success("Documento cargado");
      reload();
      return true;
    } catch {
      toast.error("No se pudo subir el archivo");
      return false;
    }
  };

  const deleteDocument = async (documentId: string): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(DELETE_DOCUMENT_URL, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, document_id: documentId }),
      });
      if (await handleMembershipError(res)) return false;
      toast.success("Documento eliminado");
      reload();
      return true;
    } catch {
      toast.error("No se pudo eliminar el documento");
      return false;
    }
  };

  const togglePrivacy = async (documentId: string, next: boolean) => {
    if (!companyId) return;
    setLocalDocs((prev) => prev.map((d) => (d.id === documentId ? { ...d, is_public: next } : d)));
    try {
      const res = await fetch(UPDATE_DOCUMENT_PRIVACY_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, document_id: documentId, is_public: next }),
      });
      if (await handleMembershipError(res)) {
        setLocalDocs((prev) => prev.map((d) => (d.id === documentId ? { ...d, is_public: !next } : d)));
      }
    } catch {
      toast.error("No se pudo actualizar la privacidad");
      setLocalDocs((prev) => prev.map((d) => (d.id === documentId ? { ...d, is_public: !next } : d)));
    }
  };

  const setVerified = async (documentId: string, verified: boolean) => {
    if (!companyId) return;
    const prevStatus = documents.find((d) => d.id === documentId)?.status;
    setLocalDocs((prev) =>
      prev.map((d) => (d.id === documentId ? { ...d, status: verified ? "verified" : "uploaded" } : d))
    );
    try {
      const res = await fetch(SET_DOCUMENT_VERIFIED_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, document_id: documentId, verified }),
      });
      if (await handleMembershipError(res)) {
        setLocalDocs((prev) =>
          prev.map((d) => (d.id === documentId && prevStatus ? { ...d, status: prevStatus } : d))
        );
      } else {
        toast.success(verified ? "Documento verificado" : "Verificación revertida");
      }
    } catch {
      toast.error("No se pudo actualizar la verificación");
      setLocalDocs((prev) =>
        prev.map((d) => (d.id === documentId && prevStatus ? { ...d, status: prevStatus } : d))
      );
    }
  };

  const linkTask = async (documentId: string, taskId: string | null): Promise<boolean> => {
    if (!companyId) return false;
    try {
      const res = await fetch(LINK_DOCUMENT_TASK_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, document_id: documentId, task_id: taskId }),
      });
      if (await handleMembershipError(res)) return false;
      reload();
      return true;
    } catch {
      toast.error("No se pudo vincular la tarea");
      return false;
    }
  };

  return {
    documents,
    loading,
    reload,
    createAndUpload,
    uploadFile,
    deleteDocument,
    togglePrivacy,
    setVerified,
    linkTask,
  };
}
