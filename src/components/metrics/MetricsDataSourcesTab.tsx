import { useNavigate } from "react-router-dom";
import { FileSpreadsheet, AlertTriangle, ArrowRight, Info } from "lucide-react";
import { DataTable, type DataTableColumn } from "@/components/DataTable";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import type { SheetConnection, GoogleAccount, DataRole } from "@/lib/sheetsIntegration";
import { fieldCountLabel } from "@/lib/sheetsIntegration";
import type { MetricDef, RawField } from "@/lib/metrics";
import { computeSourceStatus } from "@/lib/dataFreshness";
import { SourceStatusPill } from "@/components/metrics/SourceStatusPill";
import { resolveMetricSources } from "@/lib/metricLineage";

const DATA_ROLE_LABELS: Record<DataRole, string> = {
  source_of_truth: "Fuente de verdad",
  operational_input: "Input operativo",
  financial_model: "Modelo financiero",
  historical_snapshot: "Snapshot histórico",
  report_export: "Exportación de reporte",
};

type Props = {
  companyId: string | null;
  connections: SheetConnection[];
  accounts: GoogleAccount[];
  metrics: MetricDef[];
  rawFields: RawField[];
  loading: boolean;
};

// Fuentes de datos — antes invisible (GrowthTrackerSheets.tsx sin entrada de
// nav). Datos 100% reales: source_role/sync_mode/last_synced_at ya vienen
// del backend (list-sheet-connections, contrato 2026-08-30); Freshness es
// el único cálculo client-side, un heurístico honesto sobre un timestamp
// real (ver dataFreshness.ts), no un dato inventado.
export function MetricsDataSourcesTab({ connections, accounts, metrics, rawFields, loading }: Props) {
  const navigate = useNavigate();
  const needsReconnect = accounts.filter((a) => a.reconnect_required);

  if (loading) return <LoadingState variant="centered" className="py-16" />;

  const columns: DataTableColumn<SheetConnection>[] = [
    {
      header: "Fuente",
      cell: (c) => (
        <div className="min-w-0">
          <p className="font-medium truncate flex items-center gap-1.5">
            <FileSpreadsheet size={13} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
            {c.spreadsheet_name} · {c.sheet_name}
          </p>
          <p className="text-xs text-muted-foreground mt-0.5">{fieldCountLabel(c.field_mappings)}</p>
        </div>
      ),
    },
    {
      header: "Tipo",
      cell: (c) => <Badge variant="outline">{c.source === "excel" ? "Excel" : "Google Sheets"}</Badge>,
    },
    {
      header: (
        <span className="inline-flex items-center gap-1">
          Rol
          <span title="Qué tan confiable es esta fuente si otra mide lo mismo y no coincide. 'Fuente de verdad' gana en caso de conflicto.">
            <Info size={11} strokeWidth={1.5} className="text-muted-foreground" aria-hidden="true" />
          </span>
        </span>
      ),
      cell: (c) => (c.data_role ? <Badge variant="secondary">{DATA_ROLE_LABELS[c.data_role]}</Badge> : <span className="text-muted-foreground text-xs">—</span>),
    },
    {
      header: "Última sync",
      cell: (c) => <span className="text-xs text-muted-foreground">{c.last_synced_at ? new Date(c.last_synced_at).toLocaleString("es-AR") : "Nunca"}</span>,
    },
    {
      header: "Estado",
      cell: (c) => {
        const account = accounts.find((a) => a.account_id === c.account_id);
        return <SourceStatusPill status={computeSourceStatus(c, account)} />;
      },
    },
    {
      header: "Métricas que la usan",
      cell: (c) => {
        const count = metrics.filter((m) => resolveMetricSources(m, metrics, rawFields).some((s) => s.connectionId === c.connection_id)).length;
        return <span className="text-xs text-muted-foreground">{count}</span>;
      },
    },
  ];

  return (
    <div className="space-y-6">
      {needsReconnect.length > 0 && (
        <div className="border border-destructive/40 bg-destructive/5 rounded-md p-3 flex items-start gap-2.5" aria-live="polite">
          <AlertTriangle size={15} strokeWidth={1.5} className="text-destructive shrink-0 mt-0.5" />
          <div className="text-sm">
            <p className="font-medium">
              {needsReconnect.length} cuenta{needsReconnect.length === 1 ? "" : "s"} de Google perdió el acceso
            </p>
            <p className="text-xs text-muted-foreground mt-0.5">{needsReconnect.map((a) => a.google_account_email).join(", ")}</p>
          </div>
          <Button size="sm" variant="outline" className="ml-auto shrink-0" onClick={() => navigate("/growth-tracker/sheets")}>
            Reconectar
          </Button>
        </div>
      )}

      <div className="flex items-center justify-between">
        <p className="text-sm text-muted-foreground">
          {connections.length} fuente{connections.length === 1 ? "" : "s"} conectada{connections.length === 1 ? "" : "s"}
        </p>
        <Button size="sm" onClick={() => navigate("/growth-tracker/sheets")}>
          Gestionar fuentes <ArrowRight size={13} className="ml-1.5" />
        </Button>
      </div>

      {connections.length === 0 ? (
        <EmptyState
          icon={FileSpreadsheet}
          title="Todavía no conectaste ninguna fuente de datos."
          description="Conectá Google Sheets o subí un Excel para que tus métricas se sincronicen automáticamente."
          action={{ label: "Conectar una fuente", onClick: () => navigate("/growth-tracker/sheets") }}
        />
      ) : (
        <DataTable columns={columns} rows={connections} rowKey={(c) => c.connection_id} emptyLabel="Sin fuentes conectadas." onRowClick={() => navigate("/growth-tracker/sheets")} />
      )}
    </div>
  );
}
