import { useEffect, useState } from "react";
import { toast } from "sonner";
import { CopyCheck } from "lucide-react";
import { FormDialog } from "@/components/FormDialog";
import { Button } from "@/components/ui/button";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { handleMembershipError } from "@/lib/membership";
import { LIST_DUPLICATE_TRANSACTIONS_URL, type DuplicateTransactionGroup } from "@/lib/metricIntelligence";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  companyId: string | null;
  connectionId: string;
  connectionLabel: string;
};

// 100% determinístico, sin IA (ver Notas generales del handoff de backend) —
// agrupa filas que comparten período (granularidad de MES) + misma(s)
// entidad(es) + mismos valores numéricos exactos. Requiere que la conexión
// ya tenga transaction_type_column configurado (resolve-entities primero);
// si no, vuelve `duplicate_groups: []` — no es un error, es "todavía no
// aplica", así que el empty state no debe sonar a "sin duplicados" sin más.
export function DuplicateTransactionsDialog({ open, onOpenChange, companyId, connectionId, connectionLabel }: Props) {
  const [groups, setGroups] = useState<DuplicateTransactionGroup[] | null>(null);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (!open || !companyId) return;
    setLoading(true);
    setGroups(null);
    (async () => {
      try {
        const res = await fetch(
          `${LIST_DUPLICATE_TRANSACTIONS_URL}?company_id=${encodeURIComponent(companyId)}&connection_id=${encodeURIComponent(connectionId)}`,
          { credentials: "include" }
        );
        if (await handleMembershipError(res)) return;
        const data = await res.json();
        setGroups(Array.isArray(data?.duplicate_groups) ? data.duplicate_groups : []);
      } catch {
        toast.error("No se pudieron revisar los duplicados");
        setGroups([]);
      } finally {
        setLoading(false);
      }
    })();
  }, [open, companyId, connectionId]);

  return (
    <FormDialog
      open={open}
      onOpenChange={onOpenChange}
      title="Posibles transacciones duplicadas"
      description={`${connectionLabel} — filas del mismo período, misma entidad y mismo valor exacto.`}
      contentClassName="sm:max-w-2xl"
      footer={
        <Button variant="ghost" onClick={() => onOpenChange(false)}>
          Cerrar
        </Button>
      }
    >
      {loading ? (
        <LoadingState variant="inline" label="Revisando filas…" />
      ) : !groups || groups.length === 0 ? (
        <EmptyState
          bordered={false}
          icon={CopyCheck}
          title="Sin duplicados detectados."
          description="Puede ser porque no hay ninguno, o porque esta conexión todavía no tiene el tipo de transacción clasificado (hace falta 'Resolver entidades' primero)."
        />
      ) : (
        <div className="space-y-4">
          {groups.map((g, gi) => (
            <div key={gi} className="border border-warning/40 bg-warning/5 rounded-md p-3">
              <p className="text-xs text-muted-foreground mb-2">
                {g.period} · {Object.values(g.entities).join(", ") || "sin entidad"} · {g.rows.length} filas iguales
              </p>
              <div className="overflow-x-auto">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="text-left text-muted-foreground">
                      <th className="pr-3 py-1">Fila</th>
                      {g.rows[0] &&
                        Object.keys(g.rows[0].fields).map((k) => (
                          <th key={k} className="pr-3 py-1">
                            {k}
                          </th>
                        ))}
                    </tr>
                  </thead>
                  <tbody>
                    {g.rows.map((r) => (
                      <tr key={r.row_number} className="border-t border-border/50">
                        <td className="pr-3 py-1 font-mono">{r.row_number}</td>
                        {Object.values(r.fields).map((v, vi) => (
                          <td key={vi} className="pr-3 py-1">
                            {String(v)}
                          </td>
                        ))}
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>
          ))}
        </div>
      )}
    </FormDialog>
  );
}
