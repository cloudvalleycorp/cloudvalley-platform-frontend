import { useEffect, useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { BackLink } from "@/components/BackLink";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { DataTableToolbar } from "@/components/DataTableToolbar";
import { SkeletonSection } from "@/components/SkeletonSection";
import { LoadingState } from "@/components/LoadingState";
import { EmptyState } from "@/components/EmptyState";
import { ImportLogTable } from "@/components/financial/ImportLogTable";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { FormDialog } from "@/components/FormDialog";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { handleGatewayError } from "@/lib/adminGateway";
import {
  ASSIGN_FINANCIAL_SOURCE_URL,
  LIST_FINANCIAL_SOURCES_URL,
  LIST_FINANCIAL_REPORT_STATUS_URL,
  LIST_FINANCIAL_IMPORT_LOG_URL,
  LIST_FINANCIAL_RECORDS_URL,
  LIST_FINANCIAL_METRICS_URL,
  UPDATE_FINANCIAL_RECORD_URL,
  DELETE_FINANCIAL_RECORD_URL,
  currentPeriod,
  type ReportStatus,
  type ReportStatusEntry,
  type ImportLogEntry,
  type FinancialMetricDef,
  type FinancialRecordRow,
  type RowError,
} from "@/lib/financialData";
import { toast } from "sonner";
import { History, Building2, Pencil, Trash2, AlertTriangle } from "lucide-react";
import { API_BASE_URL } from "@/lib/apiConfig";

const LIST_COMPANIES_URL = `${API_BASE_URL}/list-companies`;

type Company = { company_id: string; name: string; is_active: boolean };

// Fuentes que un admin puede habilitar por company. "stripe" no está acá
// todavía a propósito: la integración de Stripe en Settings > Integraciones
// todavía no escribe en el módulo financiero de GCP (ver memoria de
// "stale integrations"), así que exponer el toggle sería prometer algo que
// no hace nada. Agregarlo en cuanto esté realmente wireado.
const AVAILABLE_SOURCES: { id: string; label: string }[] = [
  { id: "manual_form", label: "Formulario manual" },
  { id: "sheet", label: "Google Sheets" },
];

// Revisado 2026-09-21 (Fase 5): antes texto de color plano — el estado
// "reportado" usaba text-foreground, indistinguible de una etiqueta neutra.
// Ahora siempre Badge, mismo criterio que StatusBadge en el resto de admin.
const STATUS_CONFIG: Record<ReportStatus, { label: string; variant: "success" | "secondary" | "destructive" }> = {
  reportado: { label: "Reportado", variant: "success" },
  pendiente: { label: "Pendiente", variant: "secondary" },
  con_errores: { label: "Con errores", variant: "destructive" },
};

export default function AdminFinancialData() {
  const { isAdmin, loading } = useAuth();

  const [period, setPeriod] = useState(currentPeriod());
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [statuses, setStatuses] = useState<Record<string, ReportStatusEntry>>({});
  const [loadingStatuses, setLoadingStatuses] = useState(true);
  const [sources, setSources] = useState<Record<string, string[]>>({});
  const [loadingSources, setLoadingSources] = useState(true);
  const [assigningId, setAssigningId] = useState<string | null>(null);

  const { data: companies = [] } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: async () => {
      const res = await fetch(LIST_COMPANIES_URL, { credentials: "include" });
      if (await handleGatewayError(res)) throw new Error("No se pudo cargar empresas");
      const data = await res.json();
      return (data.companies ?? []) as Company[];
    },
    enabled: isAdmin,
  });

  const loadStatuses = async () => {
    setLoadingStatuses(true);
    try {
      const params = new URLSearchParams({ period });
      if (companyFilter !== "all") params.set("company_id", companyFilter);
      const res = await fetch(`${LIST_FINANCIAL_REPORT_STATUS_URL}?${params.toString()}`, { credentials: "include" });
      if (!res.ok) {
        setStatuses({});
        return;
      }
      const data = await res.json();
      const list: ReportStatusEntry[] = Array.isArray(data?.statuses) ? data.statuses : [];
      setStatuses(Object.fromEntries(list.map((s) => [s.company_id, s])));
    } catch {
      setStatuses({});
    } finally {
      setLoadingStatuses(false);
    }
  };

  const loadSources = async () => {
    setLoadingSources(true);
    try {
      const res = await fetch(LIST_FINANCIAL_SOURCES_URL, { credentials: "include" });
      if (!res.ok) {
        setSources({});
        return;
      }
      const data = await res.json();
      const list: { company_id: string; sources: string[] }[] = Array.isArray(data?.sources) ? data.sources : [];
      setSources(Object.fromEntries(list.map((s) => [s.company_id, s.sources])));
    } catch {
      setSources({});
    } finally {
      setLoadingSources(false);
    }
  };

  useEffect(() => {
    if (!isAdmin) return;
    loadStatuses();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isAdmin, period, companyFilter]);

  useEffect(() => {
    if (!isAdmin) return;
    loadSources();
  }, [isAdmin]);

  // assign-source reemplaza el set completo de fuentes de la company, así
  // que cada toggle tiene que mandar manual_form + sheet (+ lo que siga)
  // juntos, no solo la que se tocó — si no, prender Sheets apagaría
  // Formulario manual sin querer.
  const assignSource = async (company_id: string, source: string, enable: boolean) => {
    const current = sources[company_id] ?? [];
    const next = enable ? Array.from(new Set([...current, source])) : current.filter((s) => s !== source);
    const label = AVAILABLE_SOURCES.find((s) => s.id === source)?.label ?? source;
    setAssigningId(company_id);
    try {
      const res = await fetch(ASSIGN_FINANCIAL_SOURCE_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id, sources: next }),
      });
      if (await handleGatewayError(res)) return;
      setSources((s) => ({ ...s, [company_id]: next }));
      toast.success(`${label} ${enable ? "habilitado" : "deshabilitado"}`);
    } catch {
      toast.error("No se pudo actualizar");
    } finally {
      setAssigningId(null);
    }
  };

  const [historyCompany, setHistoryCompany] = useState<Company | null>(null);
  const [historyLogs, setHistoryLogs] = useState<ImportLogEntry[]>([]);
  const [historyRecords, setHistoryRecords] = useState<FinancialRecordRow[]>([]);
  const [historyMetricDefs, setHistoryMetricDefs] = useState<FinancialMetricDef[]>([]);
  const [loadingHistory, setLoadingHistory] = useState(false);
  // Distingue "la request falló" de "no hay datos todavía" — antes un 500
  // real (visto en vivo contra list-import-log) caía silencioso al mismo
  // estado vacío que "nunca reportó nada", violando el requisito explícito
  // de que todo error se pueda ver sin mirar código/GCP.
  const [historyErrors, setHistoryErrors] = useState<{ logs: boolean; records: boolean }>({ logs: false, records: false });

  const loadHistory = async (c: Company) => {
    setLoadingHistory(true);
    setHistoryErrors({ logs: false, records: false });
    try {
      const qs = `?company_id=${encodeURIComponent(c.company_id)}`;
      const [logsRes, recordsRes, metricsRes] = await Promise.all([
        fetch(`${LIST_FINANCIAL_IMPORT_LOG_URL}${qs}`, { credentials: "include" }),
        fetch(`${LIST_FINANCIAL_RECORDS_URL}${qs}`, { credentials: "include" }),
        fetch(`${LIST_FINANCIAL_METRICS_URL}${qs}`, { credentials: "include" }),
      ]);
      if (logsRes.ok) {
        const logsData = await logsRes.json();
        setHistoryLogs(Array.isArray(logsData?.logs) ? logsData.logs : []);
      } else {
        setHistoryLogs([]);
        setHistoryErrors((e) => ({ ...e, logs: true }));
      }
      if (recordsRes.ok) {
        const recordsData = await recordsRes.json();
        setHistoryRecords(Array.isArray(recordsData?.records) ? recordsData.records : []);
      } else {
        setHistoryRecords([]);
        setHistoryErrors((e) => ({ ...e, records: true }));
      }
      const metricsData = metricsRes.ok ? await metricsRes.json() : null;
      setHistoryMetricDefs(Array.isArray(metricsData?.metrics) ? metricsData.metrics : []);
    } catch {
      setHistoryLogs([]);
      setHistoryRecords([]);
      setHistoryMetricDefs([]);
      setHistoryErrors({ logs: true, records: true });
    } finally {
      setLoadingHistory(false);
    }
  };

  const openHistory = (c: Company) => {
    setHistoryCompany(c);
    loadHistory(c);
  };

  // Columnas 100% dinámicas: cualquier input_key que tenga al menos un valor
  // cargado se muestra, custom o del catálogo default de Acquisition/
  // Retention incluidos — no solo los 8 campos originales. El label sale de
  // la métrica actual con ese input_key; si ya no existe (renombrada o
  // borrada), se muestra el campo crudo tal cual para no ocultar datos.
  const historyColumns = useMemo(() => {
    const labelByKey = new Map<string, string>();
    for (const def of historyMetricDefs) {
      if (def.metric_type === "input" && def.input_key) labelByKey.set(def.input_key, def.name);
    }
    const keysWithData = new Set<string>();
    for (const r of historyRecords) {
      for (const [key, value] of Object.entries(r)) {
        if (key === "period" || value == null) continue;
        keysWithData.add(key);
      }
    }
    return Array.from(keysWithData).map((key) => ({ key, label: labelByKey.get(key) ?? key }));
  }, [historyMetricDefs, historyRecords]);

  // CRUD de registros puntuales (Fase 5, backend confirmado 2026-09-21,
  // Bloque 2) — edición/eliminación de un (período, métrica) puntual.
  const [editingRecord, setEditingRecord] = useState<{ period: string; metric: string; label: string; value: number } | null>(null);
  const [editValue, setEditValue] = useState("");
  const [savingRecord, setSavingRecord] = useState(false);
  const [recordErrors, setRecordErrors] = useState<RowError[]>([]);

  const openEditRecord = (period: string, metric: string, label: string, value: number) => {
    setEditingRecord({ period, metric, label, value });
    setEditValue(String(value));
    setRecordErrors([]);
  };

  const saveRecord = async () => {
    if (!historyCompany || !editingRecord) return;
    const value = Number(editValue);
    if (Number.isNaN(value)) {
      toast.error("Valor inválido");
      return;
    }
    setSavingRecord(true);
    try {
      const res = await fetch(UPDATE_FINANCIAL_RECORD_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: historyCompany.company_id,
          period: editingRecord.period,
          metric: editingRecord.metric,
          value,
        }),
      });
      if (await handleGatewayError(res)) return;
      const data = (await res.json()) as { row_errors: RowError[] };
      if (data.row_errors.length > 0) {
        setRecordErrors(data.row_errors);
        toast.error("El valor no se guardó — ver el motivo abajo");
        return;
      }
      toast.success("Valor actualizado");
      setEditingRecord(null);
      loadHistory(historyCompany);
      loadStatuses();
    } catch {
      toast.error("No se pudo guardar");
    } finally {
      setSavingRecord(false);
    }
  };

  const [deletingRecord, setDeletingRecord] = useState<{ period: string; metric: string; label: string } | null>(null);
  const [deletingBusy, setDeletingBusy] = useState(false);

  const confirmDeleteRecord = async () => {
    if (!historyCompany || !deletingRecord) return;
    setDeletingBusy(true);
    try {
      const res = await fetch(DELETE_FINANCIAL_RECORD_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: historyCompany.company_id,
          period: deletingRecord.period,
          metric: deletingRecord.metric,
        }),
      });
      if (await handleGatewayError(res)) return;
      toast.success("Registro eliminado");
      setDeletingRecord(null);
      loadHistory(historyCompany);
      loadStatuses();
    } catch {
      toast.error("No se pudo eliminar");
    } finally {
      setDeletingBusy(false);
    }
  };

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const visibleCompanies = companyFilter === "all" ? companies : companies.filter((c) => c.company_id === companyFilter);

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <BackLink to="/admin" label="Volver a Ecosistema CloudValley" className="mb-6" />
        <PageHeader title="Datos financieros" subtitle="Seguimiento de reportes mensuales del portfolio." />

        <DataTableToolbar
          filters={
            <>
              <div>
                <Label className="text-xs">Período</Label>
                <Input type="month" value={period} onChange={(e) => setPeriod(e.target.value)} className="mt-1 h-9 w-40" />
              </div>
              <div>
                <Label className="text-xs">Empresa</Label>
                <Select value={companyFilter} onValueChange={setCompanyFilter}>
                  <SelectTrigger className="mt-1 w-56 h-9"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">Todas</SelectItem>
                    {companies.map((c) => (
                      <SelectItem key={c.company_id} value={c.company_id}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          }
        />

        {loadingStatuses ? (
          <SkeletonSection rows={5} columns={4} />
        ) : (
          <DataTable
            columns={[
              { header: "Empresa", cell: (c: Company) => <span className="font-medium">{c.name}</span> },
              {
                header: `Estado (${period})`,
                cell: (c: Company) => {
                  const entry = statuses[c.company_id];
                  if (!entry) return <span className="text-xs text-muted-foreground">Sin datos</span>;
                  const cfg = STATUS_CONFIG[entry.status];
                  return (
                    <button
                      type="button"
                      onClick={() => openHistory(c)}
                      className="inline-flex"
                      title={entry.status === "con_errores" ? "Ver el motivo en el historial" : undefined}
                    >
                      <Badge variant={cfg.variant}>{cfg.label}</Badge>
                    </button>
                  );
                },
              },
              {
                header: "Fuentes habilitadas",
                cell: (c: Company) =>
                  loadingSources ? (
                    <LoadingState variant="inline" className="text-xs" />
                  ) : (
                    <div className="flex flex-col gap-1.5">
                      {AVAILABLE_SOURCES.map((src) => (
                        <label key={src.id} className="flex items-center gap-2 text-xs cursor-pointer">
                          <Switch
                            checked={(sources[c.company_id] ?? []).includes(src.id)}
                            disabled={assigningId === c.company_id}
                            onCheckedChange={(checked) => assignSource(c.company_id, src.id, checked)}
                          />
                          {src.label}
                        </label>
                      ))}
                    </div>
                  ),
              },
              {
                header: "Acciones",
                align: "right",
                cell: (c: Company) => (
                  <Button size="sm" variant="ghost" onClick={() => openHistory(c)}>
                    <History size={12} className="mr-1" /> Historial
                  </Button>
                ),
              },
            ]}
            rows={visibleCompanies}
            rowKey={(c) => c.company_id}
            emptyLabel={
              <EmptyState bordered={false} icon={Building2} title="No hay empresas todavía." />
            }
          />
        )}
      </div>

      <FormDialog
        open={!!historyCompany}
        onOpenChange={(o) => !o && setHistoryCompany(null)}
        title={`Historial de ${historyCompany?.name}`}
        description="Valores reportados por período e intentos de carga, incluidos los que fallaron."
        contentClassName="sm:max-w-3xl"
        footer={
          <Button variant="ghost" onClick={() => setHistoryCompany(null)}>
            Cerrar
          </Button>
        }
      >
        {loadingHistory ? (
          <LoadingState />
        ) : (
          <div className="space-y-6">
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">Valores reportados</h3>
              {historyErrors.records ? (
                <EmptyState
                  bordered={false}
                  icon={AlertTriangle}
                  title="No se pudieron cargar los valores reportados."
                  description="Hubo un error consultando el servidor — no significa que no haya datos. Reintentá cerrando y abriendo el historial de nuevo."
                  className="p-6"
                />
              ) : historyRecords.length === 0 ? (
                <EmptyState bordered={false} icon={Building2} title="Todavía no hay ningún valor cargado." className="p-6" />
              ) : (
                <DataTable
                  columns={[
                    { header: "Período", cell: (r: FinancialRecordRow) => <span className="font-medium whitespace-nowrap">{r.period}</span> },
                    ...historyColumns.map((col) => ({
                      header: col.label,
                      align: "right" as const,
                      cell: (r: FinancialRecordRow) => {
                        const value = r[col.key];
                        if (value == null) return <span className="text-tertiary">—</span>;
                        return (
                          <div className="flex items-center justify-end gap-0.5">
                            <span className="tabular-nums">{value.toLocaleString()}</span>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0"
                              aria-label={`Editar ${col.label} de ${r.period}`}
                              onClick={() => openEditRecord(r.period, col.key, col.label, value)}
                            >
                              <Pencil size={11} />
                            </Button>
                            <Button
                              size="sm"
                              variant="ghost"
                              className="h-6 w-6 p-0 text-muted-foreground hover:text-destructive"
                              aria-label={`Eliminar ${col.label} de ${r.period}`}
                              onClick={() => setDeletingRecord({ period: r.period, metric: col.key, label: col.label })}
                            >
                              <Trash2 size={11} />
                            </Button>
                          </div>
                        );
                      },
                    })),
                  ]}
                  rows={historyRecords.slice().sort((a, b) => (a.period < b.period ? 1 : -1))}
                  rowKey={(r) => r.period}
                  emptyLabel="Sin datos"
                />
              )}
            </div>
            <div>
              <h3 className="text-sm font-medium text-foreground mb-3">Intentos de carga</h3>
              <ImportLogTable
                logs={historyLogs}
                emptyLabel={
                  historyErrors.logs
                    ? "No se pudo cargar el historial de importaciones — hubo un error del servidor, reintentá en unos minutos."
                    : "Todavía no reportó ningún dato."
                }
              />
            </div>
          </div>
        )}
      </FormDialog>

      <FormDialog
        open={!!editingRecord}
        onOpenChange={(o) => !o && setEditingRecord(null)}
        title={`Editar ${editingRecord?.label} — ${editingRecord?.period}`}
        description="Corrige el valor de esta métrica para este período puntual."
        onSubmit={saveRecord}
        submitLabel="Guardar"
        busy={savingRecord}
      >
        <Label className="text-xs">Valor</Label>
        <Input type="number" value={editValue} onChange={(e) => setEditValue(e.target.value)} className="mt-1" autoFocus />
        {recordErrors.length > 0 && (
          <ul className="mt-2 space-y-1">
            {recordErrors.map((e, i) => (
              <li key={i} className="text-xs text-destructive-dark">
                <span className="font-medium">{e.field}</span>: {e.reason}
              </li>
            ))}
          </ul>
        )}
      </FormDialog>

      <ConfirmationDialog
        open={!!deletingRecord}
        onOpenChange={(o) => !o && setDeletingRecord(null)}
        title={`¿Eliminar ${deletingRecord?.label} de ${deletingRecord?.period}?`}
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={confirmDeleteRecord}
        busy={deletingBusy}
      />
    </AppLayout>
  );
}
