import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { LoadingState } from "@/components/LoadingState";
import { LIST_CONNECTIONS_URL, type Connection } from "@/lib/connections";
import { useResourceShares, type ResourceType } from "@/hooks/useResourceShares";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  resourceType: ResourceType;
  resourceId: string;
  resourceName: string;
  /** Solo documentos: is_public no existe a nivel carpeta (ver backend). */
  isPublic?: boolean;
  onTogglePublic?: (next: boolean) => void;
};

function toIsoEndOfDay(dateStr: string): string | null {
  if (!dateStr) return null;
  return new Date(`${dateStr}T23:59:59`).toISOString();
}

function toDateInputValue(iso: string | null): string {
  if (!iso) return "";
  return iso.slice(0, 10);
}

/** Compartir un documento o carpeta con un fondo puntual, con vencimiento opcional — además del atajo "compartido con todos los conectados" (solo documentos, is_public). */
export function ShareDialog({ open, onOpenChange, companyId, resourceType, resourceId, resourceName, isPublic, onTogglePublic }: Props) {
  const [connections, setConnections] = useState<Connection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(false);
  const { shares, loading, sharingId, load, isShared, shareWith, unshareWith } = useResourceShares(companyId, resourceType);
  const [draftExpiry, setDraftExpiry] = useState<Record<string, string>>({});

  useEffect(() => {
    if (!open || !companyId) return;
    load(resourceId);
    setLoadingConnections(true);
    fetch(LIST_CONNECTIONS_URL, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => {
        const list: Connection[] = Array.isArray(data?.connections) ? data.connections : [];
        setConnections(list.filter((c) => c.status === "connected"));
      })
      .catch(() => setConnections([]))
      .finally(() => setLoadingConnections(false));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, companyId, resourceId]);

  const shareFor = (connectionId: string) => shares.find((s) => s.connection_id === connectionId && !s.is_expired);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Compartir "{resourceName}"</DialogTitle>
          <DialogDescription>
            {resourceType === "folder"
              ? "Compartir una carpeta comparte automáticamente todo lo que tiene adentro, incluidas las subcarpetas."
              : "Elegí con qué fondos conectados compartir este documento."}
          </DialogDescription>
        </DialogHeader>

        {resourceType === "document" && onTogglePublic && (
          <div className="flex items-center justify-between py-2 border-b border-border">
            <div>
              <div className="text-sm font-medium">Todos los fondos conectados</div>
              <div className="text-xs text-muted-foreground">Incluye automáticamente a los que se conecten después.</div>
            </div>
            <Switch checked={!!isPublic} onCheckedChange={onTogglePublic} />
          </div>
        )}

        <div className="pt-1">
          <div className="text-xs font-medium text-muted-foreground mb-2">Compartir con un fondo en particular</div>
          {loadingConnections || loading ? (
            <LoadingState />
          ) : connections.length === 0 ? (
            <p className="text-sm text-muted-foreground">Todavía no tenés conexiones activas con ningún fondo.</p>
          ) : (
            <div className="divide-y divide-border max-h-72 overflow-y-auto -mx-1 px-1">
              {connections.map((c) => {
                const active = isShared(c.connection_id);
                const share = shareFor(c.connection_id);
                return (
                  <div key={c.connection_id} className="py-2.5">
                    <div className="flex items-center justify-between gap-3">
                      <span className="text-sm truncate">{c.counterpart_name}</span>
                      <Switch
                        checked={active}
                        disabled={sharingId === c.connection_id}
                        onCheckedChange={(checked) => {
                          if (checked) {
                            const expiry = toIsoEndOfDay(draftExpiry[c.connection_id] ?? "");
                            shareWith(resourceId, c, expiry);
                          } else {
                            unshareWith(resourceId, c);
                          }
                        }}
                      />
                    </div>
                    {active && (
                      <div className="flex items-center gap-2 mt-1.5">
                        <span className="text-[11px] text-muted-foreground shrink-0">Vence</span>
                        <Input
                          type="date"
                          className="h-7 text-xs w-36"
                          value={draftExpiry[c.connection_id] ?? toDateInputValue(share?.expires_at ?? null)}
                          onChange={(e) => {
                            const next = e.target.value;
                            setDraftExpiry((prev) => ({ ...prev, [c.connection_id]: next }));
                            shareWith(resourceId, c, toIsoEndOfDay(next));
                          }}
                        />
                        <span className="text-[11px] text-tertiary">(vacío = sin vencimiento)</span>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
