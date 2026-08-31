import { useEffect, useState } from "react";
import { toast } from "sonner";
import { X, Pencil, ArrowRightLeft } from "lucide-react";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { handleMembershipError } from "@/lib/membership";
import {
  LIST_ENTITY_ALIASES_URL,
  UPDATE_ENTITY_ALIAS_URL,
  DELETE_ENTITY_ALIAS_URL,
  type EntityType,
  type CanonicalEntity,
} from "@/lib/entityResolution";

const ENTITY_TYPE_LABELS: Record<EntityType, string> = { customer: "Cliente", vendor: "Proveedor", account: "Cuenta" };

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
};

// Pantalla de post-confirmación de resolve-entities — corrige agrupaciones
// que la IA armó mal: renombrar un cluster, mover un alias suelto a otra
// entidad canónica, o sacarlo (soft-delete, queda auditable). Nada de esto
// reprocesa filas históricas — mismo límite ya documentado en
// EntityResolutionDialog.
export function EntityAliasesDialog({ open, onOpenChange, companyId }: Props) {
  const [entityType, setEntityType] = useState<EntityType>("customer");
  const [entities, setEntities] = useState<CanonicalEntity[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [renaming, setRenaming] = useState<string | null>(null);
  const [renameValue, setRenameValue] = useState("");
  const [movingAlias, setMovingAlias] = useState<{ alias: string; fromId: string } | null>(null);
  const [moveTargetId, setMoveTargetId] = useState("");
  const [busy, setBusy] = useState(false);

  const load = async () => {
    if (!companyId) return;
    setLoading(true);
    try {
      const res = await fetch(
        `${LIST_ENTITY_ALIASES_URL}?company_id=${encodeURIComponent(companyId)}&entity_type=${entityType}`,
        { credentials: "include" }
      );
      if (await handleMembershipError(res)) return;
      const data = await res.json();
      setEntities(Array.isArray(data?.entities) ? data.entities : []);
    } catch {
      toast.error("No se pudieron cargar las entidades");
      setEntities([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, entityType, companyId]);

  const rename = async (canonicalEntityId: string, currentAliases: string[]) => {
    if (!companyId || currentAliases.length === 0 || !renameValue.trim()) return;
    setBusy(true);
    try {
      const res = await fetch(UPDATE_ENTITY_ALIAS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          entity_type: entityType,
          alias: currentAliases[0],
          canonical_entity_id: canonicalEntityId,
          display_name: renameValue.trim(),
        }),
      });
      if (await handleMembershipError(res)) return;
      if (!res.ok) {
        toast.error("No se pudo renombrar");
        return;
      }
      toast.success("Renombrado");
      setRenaming(null);
      load();
    } catch {
      toast.error("No se pudo renombrar");
    } finally {
      setBusy(false);
    }
  };

  const move = async () => {
    if (!companyId || !movingAlias || !moveTargetId) return;
    setBusy(true);
    try {
      const res = await fetch(UPDATE_ENTITY_ALIAS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          entity_type: entityType,
          alias: movingAlias.alias,
          canonical_entity_id: moveTargetId,
        }),
      });
      if (await handleMembershipError(res)) return;
      if (!res.ok) {
        toast.error("No se pudo mover");
        return;
      }
      toast.success("Alias movido");
      setMovingAlias(null);
      setMoveTargetId("");
      load();
    } catch {
      toast.error("No se pudo mover");
    } finally {
      setBusy(false);
    }
  };

  const removeAlias = async (alias: string) => {
    if (!companyId) return;
    setBusy(true);
    try {
      const res = await fetch(DELETE_ENTITY_ALIAS_URL, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id: companyId, entity_type: entityType, alias }),
      });
      if (await handleMembershipError(res)) return;
      if (!res.ok) {
        toast.error("No se pudo quitar el alias");
        return;
      }
      toast.success("Alias quitado");
      load();
    } catch {
      toast.error("No se pudo quitar el alias");
    } finally {
      setBusy(false);
    }
  };

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Entidades resueltas"
      description="Revisá y corregí las agrupaciones que hizo la IA — renombrá un grupo, movés un alias a otra entidad, o sacalo."
      contentClassName="sm:max-w-xl"
      footer={
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cerrar
        </Button>
      }
    >
      <FormField label="Tipo de entidad">
        <Select value={entityType} onValueChange={(v) => setEntityType(v as EntityType)}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {(Object.keys(ENTITY_TYPE_LABELS) as EntityType[]).map((t) => (
              <SelectItem key={t} value={t}>
                {ENTITY_TYPE_LABELS[t]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      {loading ? (
        <LoadingState variant="inline" label="Cargando entidades…" />
      ) : !entities || entities.length === 0 ? (
        <EmptyState
          bordered={false}
          title="Todavía no hay entidades resueltas de este tipo."
          description="Se generan al confirmar una propuesta desde 'Resolver entidades' en Fuentes de datos."
        />
      ) : (
        <div className="space-y-3">
          {entities.map((e) => (
            <div key={e.canonical_entity_id} className="border border-border rounded-md p-3">
              <div className="flex items-center justify-between gap-2 mb-2">
                {renaming === e.canonical_entity_id ? (
                  <div className="flex items-center gap-1.5 flex-1">
                    <Input
                      value={renameValue}
                      onChange={(ev) => setRenameValue(ev.target.value)}
                      className="h-7 text-sm"
                      aria-label="Nuevo nombre"
                      autoFocus
                    />
                    <Button size="sm" className="h-7" disabled={busy} onClick={() => rename(e.canonical_entity_id, e.aliases)}>
                      Guardar
                    </Button>
                    <Button size="sm" variant="ghost" className="h-7" onClick={() => setRenaming(null)}>
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <>
                    <p className="font-medium text-sm">{e.display_name}</p>
                    <button
                      type="button"
                      onClick={() => {
                        setRenaming(e.canonical_entity_id);
                        setRenameValue(e.display_name);
                      }}
                      className="text-muted-foreground hover:text-foreground shrink-0"
                      aria-label={`Renombrar ${e.display_name}`}
                    >
                      <Pencil size={12} strokeWidth={1.5} />
                    </button>
                  </>
                )}
              </div>
              <div className="flex flex-wrap gap-1.5">
                {e.aliases.map((alias) => (
                  <span key={alias} className="inline-flex items-center gap-1 text-xs bg-surface border border-border rounded px-1.5 py-0.5">
                    {alias}
                    <button
                      type="button"
                      onClick={() => {
                        setMovingAlias({ alias, fromId: e.canonical_entity_id });
                        setMoveTargetId("");
                      }}
                      aria-label={`Mover ${alias} a otra entidad`}
                      title="Mover a otra entidad"
                    >
                      <ArrowRightLeft size={10} strokeWidth={1.5} />
                    </button>
                    <button type="button" onClick={() => removeAlias(alias)} aria-label={`Quitar ${alias}`} title="Quitar">
                      <X size={10} strokeWidth={1.5} />
                    </button>
                  </span>
                ))}
              </div>
              {movingAlias?.fromId === e.canonical_entity_id && (
                <div className="flex items-center gap-1.5 mt-2 pt-2 border-t border-border">
                  <span className="text-xs text-muted-foreground shrink-0">Mover "{movingAlias.alias}" a:</span>
                  <Select value={moveTargetId} onValueChange={setMoveTargetId}>
                    <SelectTrigger className="h-7 text-xs flex-1">
                      <SelectValue placeholder="Elegí la entidad destino…" />
                    </SelectTrigger>
                    <SelectContent>
                      {entities
                        .filter((t) => t.canonical_entity_id !== e.canonical_entity_id)
                        .map((t) => (
                          <SelectItem key={t.canonical_entity_id} value={t.canonical_entity_id}>
                            {t.display_name}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                  <Button size="sm" className="h-7" disabled={busy || !moveTargetId} onClick={move}>
                    Mover
                  </Button>
                  <Button size="sm" variant="ghost" className="h-7" onClick={() => setMovingAlias(null)}>
                    Cancelar
                  </Button>
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </FormDialog>
  );
}
