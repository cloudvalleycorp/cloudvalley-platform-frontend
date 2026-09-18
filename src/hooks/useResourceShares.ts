import { useState } from "react";
import { toast } from "sonner";
import { handleMembershipError } from "@/lib/membership";
import type { Connection } from "@/lib/connections";
import {
  SHARE_DOCUMENT_URL,
  UNSHARE_DOCUMENT_URL,
  LIST_DOCUMENT_SHARES_URL,
  SHARE_FOLDER_URL,
  UNSHARE_FOLDER_URL,
  LIST_FOLDER_SHARES_URL,
  type ResourceShare,
} from "@/lib/dataRoom";

export type ResourceType = "document" | "folder";

const ENDPOINTS: Record<ResourceType, { share: string; unshare: string; list: string; idKey: "document_id" | "folder_id" }> = {
  document: { share: SHARE_DOCUMENT_URL, unshare: UNSHARE_DOCUMENT_URL, list: LIST_DOCUMENT_SHARES_URL, idKey: "document_id" },
  folder: { share: SHARE_FOLDER_URL, unshare: UNSHARE_FOLDER_URL, list: LIST_FOLDER_SHARES_URL, idKey: "folder_id" },
};

// Compartir granular por fondo (con vencimiento opcional) — mismo patrón que
// share-financial-report/unshare-financial-report/list-financial-report-shares
// en ReportEditor.tsx, generalizado a documentos y carpetas (dos familias de
// endpoints separadas del lado backend, ver plan). Se pide bajo demanda al
// abrir ShareDialog, no en cada carga de la fila (list-documents ya trae
// shared_connection_count para el badge, alcanza sin este fetch).
export function useResourceShares(companyId: string | null, resourceType: ResourceType) {
  const [shares, setShares] = useState<ResourceShare[]>([]);
  const [loading, setLoading] = useState(false);
  const [sharingId, setSharingId] = useState<string | null>(null);
  const endpoints = ENDPOINTS[resourceType];

  const load = async (resourceId: string) => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${endpoints.list}?company_id=${encodeURIComponent(companyId)}&${endpoints.idKey}=${encodeURIComponent(resourceId)}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        setShares([]);
        return;
      }
      const data = await res.json();
      setShares(Array.isArray(data?.shares) ? data.shares : []);
    } catch {
      setShares([]);
    } finally {
      setLoading(false);
    }
  };

  const isShared = (connectionId: string) => shares.some((s) => s.connection_id === connectionId && !s.is_expired);

  const shareWith = async (resourceId: string, connection: Connection, expiresAt: string | null) => {
    if (!companyId) return;
    setSharingId(connection.connection_id);
    try {
      const res = await fetch(endpoints.share, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          [endpoints.idKey]: resourceId,
          connection_id: connection.connection_id,
          expires_at: expiresAt,
        }),
      });
      if (await handleMembershipError(res)) return;
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        toast.error(data?.error ?? "No se pudo compartir");
        return;
      }
      toast.success(`Compartido con ${connection.counterpart_name}`);
      await load(resourceId);
    } catch {
      toast.error("No se pudo compartir");
    } finally {
      setSharingId(null);
    }
  };

  const unshareWith = async (resourceId: string, connection: Connection) => {
    if (!companyId) return;
    setSharingId(connection.connection_id);
    try {
      const res = await fetch(endpoints.unshare, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, [endpoints.idKey]: resourceId, connection_id: connection.connection_id }),
      });
      if (await handleMembershipError(res)) return;
      if (!res.ok) {
        toast.error("No se pudo dejar de compartir");
        return;
      }
      toast.success(`Ya no se comparte con ${connection.counterpart_name}`);
      await load(resourceId);
    } catch {
      toast.error("No se pudo dejar de compartir");
    } finally {
      setSharingId(null);
    }
  };

  return { shares, loading, sharingId, load, isShared, shareWith, unshareWith };
}
