import { useState } from "react";
import { toast } from "sonner";
import { ChevronDown, ChevronRight, FileText, Folder, BarChart3, Unlink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Badge } from "@/components/ui/badge";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { DocumentAnalyticsSheet } from "@/components/dataRoom/DocumentAnalyticsSheet";
import { FolderAnalyticsSheet } from "@/components/dataRoom/FolderAnalyticsSheet";
import { handleMembershipError } from "@/lib/membership";
import { UNSHARE_DOCUMENT_URL, UNSHARE_FOLDER_URL, type AnyResourceShare } from "@/lib/dataRoom";
import { useAllDocumentShares } from "@/hooks/useAllDocumentShares";

type Props = {
  companyId: string | null;
  documentIdsUnderFolder: (folderId: string) => string[];
};

async function unshare(companyId: string, share: AnyResourceShare): Promise<boolean> {
  const url = share.resource_type === "document" ? UNSHARE_DOCUMENT_URL : UNSHARE_FOLDER_URL;
  const idKey = share.resource_type === "document" ? "document_id" : "folder_id";
  const resourceId = share.resource_type === "document" ? share.document_id : share.folder_id;
  const res = await fetch(url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ company_id: companyId, [idKey]: resourceId, connection_id: share.connection_id }),
  });
  if (await handleMembershipError(res)) return false;
  return res.ok;
}

function formatDate(iso: string): string {
  return new Date(iso).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" });
}

/** Gestión de Accesos — todo lo compartido, agrupado por fondo conectado. Revocar reusa unshare-document/unshare-folder; la actividad reusa las analytics sheets ya construidas para documentos/carpetas individuales. */
export function AccessManagementTab({ companyId, documentIdsUnderFolder }: Props) {
  const { groups, loading, reload } = useAllDocumentShares(companyId);
  const [openConnectionId, setOpenConnectionId] = useState<string | null>(null);
  const [revoking, setRevoking] = useState<{ share: AnyResourceShare; counterpartName: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [viewingDoc, setViewingDoc] = useState<string | null>(null);
  const [viewingFolder, setViewingFolder] = useState<{ id: string; name: string } | null>(null);

  const confirmRevoke = async () => {
    if (!revoking || !companyId) return;
    setBusy(true);
    const ok = await unshare(companyId, revoking.share);
    setBusy(false);
    if (ok) {
      toast.success(`Ya no se comparte con ${revoking.counterpartName}`);
      setRevoking(null);
      reload();
    } else {
      toast.error("No se pudo revocar el acceso");
    }
  };

  if (loading) return <LoadingState variant="centered" className="py-16" />;

  if (groups.length === 0) {
    return (
      <EmptyState
        icon={Unlink}
        title="Todavía no compartiste nada con ningún fondo en particular."
        description="Compartí un documento o una carpeta puntual desde el explorador para verlo acá."
      />
    );
  }

  return (
    <div className="border border-border rounded-lg bg-card overflow-hidden">
      {groups.map((group) => {
        const isOpen = openConnectionId === group.connection_id;
        return (
          <div key={group.connection_id} className="border-b border-border/50 last:border-0">
            <button
              type="button"
              onClick={() => setOpenConnectionId(isOpen ? null : group.connection_id)}
              aria-expanded={isOpen}
              className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface/60 transition-colors"
            >
              {isOpen ? (
                <ChevronDown size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
              ) : (
                <ChevronRight size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
              )}
              <span className="flex-1 min-w-0 text-sm font-medium truncate">{group.counterpart_name}</span>
              <span className="text-xs text-muted-foreground shrink-0">
                {group.shares.length} recurso{group.shares.length === 1 ? "" : "s"} compartido{group.shares.length === 1 ? "" : "s"}
              </span>
            </button>
            {isOpen && (
              <div className="divide-y divide-border/50">
                {group.shares.map((share) => {
                  const name = share.resource_type === "document" ? share.document_name : share.folder_name;
                  const key = `${share.resource_type}:${share.document_id ?? share.folder_id}`;
                  return (
                    <div key={key} className="flex items-center gap-3 px-4 py-2.5 pl-11">
                      {share.resource_type === "document" ? (
                        <FileText size={13} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                      ) : (
                        <Folder size={13} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                      )}
                      <div className="flex-1 min-w-0">
                        <div className="text-sm truncate flex items-center gap-1.5">
                          {name}
                          {share.is_expired && (
                            <Badge variant="secondary" className="text-[10px]">
                              Vencido
                            </Badge>
                          )}
                        </div>
                        <div className="text-[11px] text-muted-foreground mt-0.5">
                          Compartido el {formatDate(share.shared_at)}
                          {share.shared_by_name ? ` por ${share.shared_by_name}` : ""}
                          {share.expires_at ? ` · vence el ${formatDate(share.expires_at)}` : ""}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0"
                        title="Ver actividad"
                        aria-label={`Ver actividad de ${name}`}
                        onClick={() => {
                          if (share.resource_type === "document" && share.document_id) setViewingDoc(share.document_id);
                          if (share.resource_type === "folder" && share.folder_id && share.folder_name) {
                            setViewingFolder({ id: share.folder_id, name: share.folder_name });
                          }
                        }}
                      >
                        <BarChart3 size={13} strokeWidth={1.5} />
                      </Button>
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-7 w-7 shrink-0 hover:text-destructive"
                        title="Revocar acceso"
                        aria-label={`Revocar acceso a ${name}`}
                        onClick={() => setRevoking({ share, counterpartName: group.counterpart_name })}
                      >
                        <Unlink size={13} strokeWidth={1.5} />
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}

      <ConfirmationDialog
        open={!!revoking}
        onOpenChange={(o) => !o && setRevoking(null)}
        title="Revocar acceso"
        description={
          revoking ? (
            <>
              <strong>{revoking.counterpartName}</strong> ya no va a poder ver{" "}
              {revoking.share.resource_type === "document" ? revoking.share.document_name : revoking.share.folder_name}.
            </>
          ) : (
            ""
          )
        }
        confirmLabel="Revocar acceso"
        variant="destructive"
        busy={busy}
        onConfirm={confirmRevoke}
      />

      <DocumentAnalyticsSheet
        open={!!viewingDoc}
        onOpenChange={(o) => !o && setViewingDoc(null)}
        companyId={companyId}
        documentId={viewingDoc}
      />

      {viewingFolder && (
        <FolderAnalyticsSheet
          open={!!viewingFolder}
          onOpenChange={(o) => !o && setViewingFolder(null)}
          companyId={companyId}
          folderName={viewingFolder.name}
          documentIds={documentIdsUnderFolder(viewingFolder.id)}
        />
      )}
    </div>
  );
}
