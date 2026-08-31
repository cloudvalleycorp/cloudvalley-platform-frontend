import { useState } from "react";
import { toast } from "sonner";
import { X } from "lucide-react";
import { FormDialog } from "@/components/FormDialog";
import { FormField } from "@/components/FormField";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LoadingState } from "@/components/LoadingState";
import { handleMembershipError } from "@/lib/membership";
import {
  RESOLVE_ENTITIES_URL,
  type EntityType,
  type EntityCluster,
  type TransactionTypeMappingRow,
  type TransactionType,
  type ResolveEntitiesConfirmEntityResponse,
  type ResolveEntitiesConfirmTransactionTypeResponse,
} from "@/lib/entityResolution";
import type { FieldMapping } from "@/lib/sheetsIntegration";

const ENTITY_TYPE_LABELS: Record<EntityType, string> = { customer: "Cliente", vendor: "Proveedor", account: "Cuenta" };
const TRANSACTION_TYPE_LABELS: Record<TransactionType, string> = {
  revenue: "Ingreso",
  expense: "Gasto",
  transfer: "Transferencia interna",
  refund: "Reembolso",
  financing: "Financiamiento",
  other: "Otro",
};

type Mode = "entity" | "transaction_type";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  connectionId: string;
  fields: FieldMapping[];
  onResolved: () => void;
};

// Entity resolution — "Acme"/"Acme Inc."/"ACME Corp" son la misma entidad;
// una columna de texto libre se clasifica en revenue/expense/transfer/etc.
// Dos pasos siempre: propuesta de IA (editable, nunca se aplica sola) →
// confirmación explícita. Nunca reprocesa filas históricas — se aplica desde
// la próxima sincronización (ver Notas del handoff de backend).
export function EntityResolutionDialog({ open, onOpenChange, companyId, connectionId, fields, onResolved }: Props) {
  const [fieldKey, setFieldKey] = useState<string>("");
  const [mode, setMode] = useState<Mode>("entity");
  const [entityType, setEntityType] = useState<EntityType>("customer");
  const [proposing, setProposing] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [clusters, setClusters] = useState<EntityCluster[] | null>(null);
  const [mapping, setMapping] = useState<TransactionTypeMappingRow[] | null>(null);

  const reset = () => {
    setFieldKey("");
    setMode("entity");
    setEntityType("customer");
    setClusters(null);
    setMapping(null);
  };

  const handleOpenChange = (o: boolean) => {
    if (!o) reset();
    onOpenChange(o);
  };

  const propose = async () => {
    if (!companyId || !fieldKey) {
      toast.error("Elegí una columna primero");
      return;
    }
    setProposing(true);
    setClusters(null);
    setMapping(null);
    try {
      const res = await fetch(RESOLVE_ENTITIES_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          connection_id: connectionId,
          field_key: fieldKey,
          mode,
          ...(mode === "entity" ? { entity_type: entityType } : {}),
        }),
      });
      if (res.status === 400) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "No se pudo generar una propuesta para esta columna");
        return;
      }
      // 429/503: cupo de IA "onboarding" agotado o servicio caído — bloqueante
      // acá (a diferencia de list-metric-highlights/explain-metric-discrepancy,
      // que degradan sin bloquear), ver Notas generales del handoff de backend.
      if (res.status === 429 || res.status === 503) {
        const data = await res.json().catch(() => ({}));
        toast.error(data?.error ?? "El servicio de IA no está disponible en este momento, intentá de nuevo en unos minutos");
        return;
      }
      if (await handleMembershipError(res)) return;
      const data = await res.json();
      if (mode === "entity") setClusters(Array.isArray(data?.clusters) ? data.clusters : []);
      else setMapping(Array.isArray(data?.mapping) ? data.mapping : []);
    } catch {
      toast.error("No se pudo generar una propuesta para esta columna");
    } finally {
      setProposing(false);
    }
  };

  const confirm = async () => {
    if (!companyId) return;
    setConfirming(true);
    try {
      const res = await fetch(RESOLVE_ENTITIES_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: companyId,
          connection_id: connectionId,
          field_key: fieldKey,
          mode,
          confirm: true,
          ...(mode === "entity"
            ? { entity_type: entityType, clusters: clusters?.map((c) => ({ canonical_name: c.canonical_name, aliases: c.aliases })) }
            : { mapping: mapping?.map((m) => ({ raw_value: m.raw_value, transaction_type: m.transaction_type })) }),
        }),
      });
      if (await handleMembershipError(res)) return;
      if (!res.ok) {
        toast.error("No se pudo confirmar");
        return;
      }
      await res.json().catch(() => null as ResolveEntitiesConfirmEntityResponse | ResolveEntitiesConfirmTransactionTypeResponse | null);
      toast.success(mode === "entity" ? "Entidades resueltas" : "Tipos de transacción clasificados");
      onResolved();
      handleOpenChange(false);
    } catch {
      toast.error("No se pudo confirmar");
    } finally {
      setConfirming(false);
    }
  };

  const hasProposal = mode === "entity" ? clusters !== null : mapping !== null;

  return (
    <FormDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Resolver entidades"
      description="La IA agrupa valores que representan lo mismo o clasifica el tipo económico de cada transacción. Nada se aplica hasta que confirmés."
      contentClassName="sm:max-w-xl"
      submitLabel={hasProposal ? "Confirmar" : "Proponer"}
      onSubmit={hasProposal ? confirm : propose}
      busy={proposing || confirming || !fieldKey}
    >
      <FormField label="Columna">
        <Select value={fieldKey} onValueChange={(v) => { setFieldKey(v); setClusters(null); setMapping(null); }}>
          <SelectTrigger>
            <SelectValue placeholder="Elegí una columna…" />
          </SelectTrigger>
          <SelectContent>
            {fields.map((f) => (
              <SelectItem key={f.field_key} value={f.field_key}>
                {f.column} ({f.field_key})
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </FormField>

      <FormField label="Qué querés resolver">
        <Select value={mode} onValueChange={(v) => { setMode(v as Mode); setClusters(null); setMapping(null); }}>
          <SelectTrigger>
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="entity">Agrupar entidades duplicadas (ej. clientes)</SelectItem>
            <SelectItem value="transaction_type">Clasificar tipo de transacción</SelectItem>
          </SelectContent>
        </Select>
      </FormField>

      {mode === "entity" && (
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
      )}

      {proposing && <LoadingState variant="inline" label="Analizando los valores de esta columna…" />}

      {mode === "entity" && clusters && (
        <div className="space-y-3">
          {clusters.length === 0 ? (
            <p className="text-sm text-muted-foreground">No se encontraron agrupaciones posibles.</p>
          ) : (
            clusters.map((c, i) => (
              <div key={i} className="border border-border rounded-md p-3">
                <Input
                  value={c.canonical_name}
                  onChange={(e) =>
                    setClusters((prev) => prev!.map((cl, idx) => (idx === i ? { ...cl, canonical_name: e.target.value } : cl)))
                  }
                  className="font-medium mb-2"
                  aria-label={`Nombre canónico del grupo ${i + 1}`}
                />
                <div className="flex flex-wrap gap-1.5">
                  {c.aliases.map((alias, ai) => (
                    <span key={ai} className="inline-flex items-center gap-1 text-xs bg-surface border border-border rounded px-1.5 py-0.5">
                      {alias}
                      <button
                        type="button"
                        onClick={() =>
                          setClusters((prev) =>
                            prev!.map((cl, idx) => (idx === i ? { ...cl, aliases: cl.aliases.filter((_, x) => x !== ai) } : cl))
                          )
                        }
                        aria-label={`Quitar ${alias} del grupo`}
                      >
                        <X size={10} strokeWidth={1.5} />
                      </button>
                    </span>
                  ))}
                </div>
              </div>
            ))
          )}
        </div>
      )}

      {mode === "transaction_type" && mapping && (
        <div className="space-y-2">
          {mapping.length === 0 ? (
            <p className="text-sm text-muted-foreground">No se encontraron valores para clasificar.</p>
          ) : (
            mapping.map((m, i) => (
              <div key={i} className="flex items-center gap-2">
                <span className="text-sm flex-1 min-w-0 truncate">{m.raw_value}</span>
                <Select
                  value={m.transaction_type}
                  onValueChange={(v) =>
                    setMapping((prev) => prev!.map((row, idx) => (idx === i ? { ...row, transaction_type: v as TransactionType } : row)))
                  }
                >
                  <SelectTrigger className="h-8 w-44 text-xs shrink-0">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {(Object.keys(TRANSACTION_TYPE_LABELS) as TransactionType[]).map((t) => (
                      <SelectItem key={t} value={t}>
                        {TRANSACTION_TYPE_LABELS[t]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            ))
          )}
        </div>
      )}

      {hasProposal && (
        <Button type="button" variant="ghost" size="sm" onClick={propose} disabled={proposing}>
          Volver a proponer
        </Button>
      )}
    </FormDialog>
  );
}
