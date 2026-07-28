import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  Unlink,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  ChevronRight,
  ChevronsUpDown,
} from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { BackLink } from "@/components/BackLink";
import { SectionCard } from "@/components/SectionCard";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { InfoRow } from "@/components/InfoRow";
import { FormActions } from "@/components/FormActions";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { ImportLogTable } from "@/components/financial/ImportLogTable";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialMetrics } from "@/hooks/useFinancialMetrics";
import { handleMembershipError } from "@/lib/membership";
import { requiredInputs } from "@/lib/formulaEngine";
import { cn } from "@/lib/utils";
import type { MetricDef } from "@/lib/metrics";
import {
  GET_SHEETS_STATUS_URL,
  CONNECT_SHEETS_URL,
  LIST_SHEETS_URL,
  GET_SHEET_TABS_URL,
  GET_SHEET_HEADERS_URL,
  SAVE_SHEET_MAPPING_URL,
  GET_SHEET_MAPPING_URL,
  SYNC_SHEETS_URL,
  DISCONNECT_SHEETS_URL,
  parseSheetsError,
  type SheetsStatus,
  type SheetSummary,
  type ColumnMapping,
  type SyncResult,
} from "@/lib/sheetsIntegration";

const UNMAPPED = "__unmapped__";
const PERIOD = "period";
const PERIOD_PATTERNS = ["periodo", "period", "mes", "month", "fecha", "date"];

type View = "loading" | "not_connected" | "wizard" | "status";
type WizardStep = 1 | 2 | 3;

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(/[^a-z0-9]+/g, "");
}

// Best-effort first pass so the user reviews/adjusts instead of mapping every
// column from scratch: exact match on the period column's usual names, then
// exact match between the header and a metric's input_key or display name.
function autoMapHeaders(headers: string[], inputDefs: MetricDef[]): ColumnMapping {
  const mapping: ColumnMapping = {};
  const usedKeys = new Set<string>();
  let periodAssigned = false;
  for (const header of headers) {
    const norm = normalizeForMatch(header);
    if (!periodAssigned && PERIOD_PATTERNS.includes(norm)) {
      mapping[header] = PERIOD;
      periodAssigned = true;
      continue;
    }
    const match = inputDefs.find(
      (d) =>
        d.input_key &&
        !usedKeys.has(d.input_key) &&
        (normalizeForMatch(d.input_key) === norm || normalizeForMatch(d.name) === norm)
    );
    if (match?.input_key) {
      mapping[header] = match.input_key;
      usedKeys.add(match.input_key);
    }
  }
  return mapping;
}

export default function GrowthTrackerSheets() {
  const { user, loading, company_id } = useAuth();
  const financial = useFinancialMetrics(company_id);
  const [searchParams, setSearchParams] = useSearchParams();

  const [status, setStatus] = useState<SheetsStatus | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);
  const [reconnectRequired, setReconnectRequired] = useState(false);
  // Un admin desactivó la fuente "sheet" para esta company — nada que el
  // founder pueda arreglar acá, distinto de reconnectRequired.
  const [sourcePaused, setSourcePaused] = useState(false);
  const [connecting, setConnecting] = useState(false);
  const [confirmDisconnect, setConfirmDisconnect] = useState(false);
  const [disconnecting, setDisconnecting] = useState(false);

  const [manualWizard, setManualWizard] = useState(false);
  const [step, setStep] = useState<WizardStep>(1);
  const [sheets, setSheets] = useState<SheetSummary[]>([]);
  const [loadingSheets, setLoadingSheets] = useState(false);
  const [sheetSearch, setSheetSearch] = useState("");
  const [selectedSpreadsheetId, setSelectedSpreadsheetId] = useState<string | null>(null);
  const [selectedSpreadsheetName, setSelectedSpreadsheetName] = useState<string>("");
  const [tabs, setTabs] = useState<string[]>([]);
  const [loadingTabs, setLoadingTabs] = useState(false);
  const [tabSearch, setTabSearch] = useState("");
  const [selectedSheetName, setSelectedSheetName] = useState<string | null>(null);
  const [headers, setHeaders] = useState<string[]>([]);
  const [loadingHeaders, setLoadingHeaders] = useState(false);
  const [columnMapping, setColumnMapping] = useState<ColumnMapping>({});
  const [staleHeaders, setStaleHeaders] = useState<string[]>([]);
  const [savingMapping, setSavingMapping] = useState(false);
  const [loadingEditMapping, setLoadingEditMapping] = useState(false);
  const pendingMappingRef = useRef<ColumnMapping | null>(null);

  const [syncBusy, setSyncBusy] = useState(false);
  const [syncResult, setSyncResult] = useState<SyncResult | null>(null);
  const [syncWasDryRun, setSyncWasDryRun] = useState(false);
  const [missingHeadersAlert, setMissingHeadersAlert] = useState<string[] | null>(null);

  const inputDefs = financial.metrics.filter((m) => m.metric_type === "input" && m.input_key);

  // Which raw fields are actually referenced by an existing calculated
  // metric's formula — so the wizard can flag "your formulas need this
  // column" instead of leaving the user to find out later that a metric
  // silently stopped calculating.
  const requiredByInputKey = useMemo(() => {
    const map: Record<string, string[]> = {};
    const inputKeySet = new Set(inputDefs.map((d) => d.input_key!));
    for (const c of financial.metrics) {
      if (c.metric_type !== "calculated" || !c.formula_expression) continue;
      for (const id of requiredInputs(c.formula_expression)) {
        if (inputKeySet.has(id)) {
          map[id] ??= [];
          map[id].push(c.name);
        }
      }
    }
    return map;
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [financial.metrics]);

  const view: View = loadingStatus && !status
    ? "loading"
    : !status?.connected
      ? "not_connected"
      : manualWizard || !status.has_mapping
        ? "wizard"
        : "status";

  // Handle the OAuth redirect back from Google (?connected=1 / ?error=1), once.
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) toast.success("Cuenta de Google conectada.");
    if (error) toast.error("No se pudo conectar con Google. Intentá de nuevo.");
    if (connected || error) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const loadStatus = async () => {
    if (!company_id) return;
    setLoadingStatus(true);
    try {
      const res = await fetch(`${GET_SHEETS_STATUS_URL}?company_id=${encodeURIComponent(company_id)}`, {
        credentials: "include",
      });
      if (await handleMembershipError(res)) return;
      const data = (await res.json()) as SheetsStatus;
      setStatus(data);
      setReconnectRequired(data.reconnect_required);
      setSourcePaused(data.source_enabled === false);
    } catch {
      toast.error("No se pudo cargar el estado de la conexión con Google Sheets");
    } finally {
      setLoadingStatus(false);
    }
  };

  useEffect(() => {
    loadStatus();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company_id]);

  const loadSheets = async () => {
    if (!company_id) return;
    setLoadingSheets(true);
    try {
      const res = await fetch(`${LIST_SHEETS_URL}?company_id=${encodeURIComponent(company_id)}`, {
        credentials: "include",
      });
      if (res.status === 400) {
        const err = await parseSheetsError(res);
        if (err.sourceDisabled) {
          setSourcePaused(true);
          return;
        }
        if (err.reconnectRequired) {
          setReconnectRequired(true);
          return;
        }
        toast.error(err.message ?? "No se pudieron listar las planillas");
        return;
      }
      if (await handleMembershipError(res)) return;
      const data = await res.json();
      setSheets(Array.isArray(data?.sheets) ? data.sheets : []);
    } catch {
      toast.error("No se pudieron listar las planillas de Google Sheets");
    } finally {
      setLoadingSheets(false);
    }
  };

  const loadTabs = async (spreadsheetId: string) => {
    if (!company_id) return;
    setLoadingTabs(true);
    try {
      const qs = `?company_id=${encodeURIComponent(company_id)}&spreadsheet_id=${encodeURIComponent(spreadsheetId)}`;
      const res = await fetch(`${GET_SHEET_TABS_URL}${qs}`, { credentials: "include" });
      if (res.status === 400) {
        const err = await parseSheetsError(res);
        if (err.sourceDisabled) {
          setSourcePaused(true);
          return;
        }
        if (err.reconnectRequired) {
          setReconnectRequired(true);
          return;
        }
        toast.error(err.message ?? "No se pudieron leer las hojas de la planilla");
        return;
      }
      if (await handleMembershipError(res)) return;
      const data = await res.json();
      setTabs(Array.isArray(data?.tabs) ? data.tabs : []);
    } catch {
      toast.error("No se pudieron leer las hojas de la planilla");
    } finally {
      setLoadingTabs(false);
    }
  };

  const loadHeaders = async (spreadsheetId: string, sheetName: string) => {
    if (!company_id) return;
    setLoadingHeaders(true);
    try {
      const qs = `?company_id=${encodeURIComponent(company_id)}&spreadsheet_id=${encodeURIComponent(spreadsheetId)}&sheet_name=${encodeURIComponent(sheetName)}`;
      const res = await fetch(`${GET_SHEET_HEADERS_URL}${qs}`, { credentials: "include" });
      if (res.status === 400) {
        const err = await parseSheetsError(res);
        if (err.sourceDisabled) {
          setSourcePaused(true);
          return;
        }
        if (err.reconnectRequired) {
          setReconnectRequired(true);
          return;
        }
        toast.error(err.message ?? "No se pudieron leer las columnas de la hoja");
        return;
      }
      if (await handleMembershipError(res)) return;
      const data = await res.json();
      const hs: string[] = Array.isArray(data?.headers) ? data.headers : [];
      setHeaders(hs);
      if (pendingMappingRef.current) {
        const saved = pendingMappingRef.current;
        pendingMappingRef.current = null;
        const seeded: ColumnMapping = {};
        const missing: string[] = [];
        for (const [header, key] of Object.entries(saved)) {
          if (hs.includes(header)) seeded[header] = key;
          else missing.push(header);
        }
        setColumnMapping(seeded);
        setStaleHeaders(missing);
      } else {
        setColumnMapping(autoMapHeaders(hs, inputDefs));
        setStaleHeaders([]);
      }
    } catch {
      toast.error("No se pudieron leer las columnas de la hoja");
    } finally {
      setLoadingHeaders(false);
    }
  };

  useEffect(() => {
    if (view === "wizard") loadSheets();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view]);

  useEffect(() => {
    if (view === "wizard" && selectedSpreadsheetId) loadTabs(selectedSpreadsheetId);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedSpreadsheetId]);

  useEffect(() => {
    if (view === "wizard" && selectedSpreadsheetId && selectedSheetName) loadHeaders(selectedSpreadsheetId, selectedSheetName);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [view, selectedSpreadsheetId, selectedSheetName]);

  const resetWizardData = () => {
    setStep(1);
    setSelectedSpreadsheetId(null);
    setSelectedSpreadsheetName("");
    setTabs([]);
    setSelectedSheetName(null);
    setHeaders([]);
    setColumnMapping({});
    setStaleHeaders([]);
    setSheetSearch("");
    setTabSearch("");
    pendingMappingRef.current = null;
  };

  const openEditMapping = async () => {
    if (!company_id) return;
    resetWizardData();
    setManualWizard(true);
    setLoadingEditMapping(true);
    try {
      const res = await fetch(`${GET_SHEET_MAPPING_URL}?company_id=${encodeURIComponent(company_id)}`, {
        credentials: "include",
      });
      if (res.status === 404) return; // no saved mapping — start fresh at step 1
      if (res.status === 400) {
        const err = await parseSheetsError(res);
        if (err.reconnectRequired) {
          setReconnectRequired(true);
          return;
        }
      }
      if (await handleMembershipError(res)) return;
      const data = await res.json();
      pendingMappingRef.current = (data?.column_mapping ?? {}) as ColumnMapping;
      setSelectedSpreadsheetId(data.spreadsheet_id ?? null);
      setSelectedSpreadsheetName(data.spreadsheet_name ?? "");
      setSelectedSheetName(data.sheet_name ?? null);
      setStep(3);
    } catch {
      toast.error("No se pudo cargar el mapeo actual");
    } finally {
      setLoadingEditMapping(false);
    }
  };

  const cancelWizard = () => {
    setManualWizard(false);
    resetWizardData();
  };

  const handleConnect = async () => {
    if (!company_id) return;
    setConnecting(true);
    try {
      const res = await fetch(CONNECT_SHEETS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id }),
      });
      if (await handleMembershipError(res)) return;
      const data = await res.json();
      if (data?.auth_url) {
        window.location.href = data.auth_url;
      } else {
        toast.error("No se pudo iniciar la conexión con Google");
      }
    } catch {
      toast.error("No se pudo iniciar la conexión con Google");
    } finally {
      setConnecting(false);
    }
  };

  const handleDisconnect = async () => {
    if (!company_id) return;
    setDisconnecting(true);
    try {
      const res = await fetch(DISCONNECT_SHEETS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id }),
      });
      if (await handleMembershipError(res)) return;
      toast.success("Desconectado de Google Sheets");
      setConfirmDisconnect(false);
      setSyncResult(null);
      await loadStatus();
    } catch {
      toast.error("No se pudo desconectar");
    } finally {
      setDisconnecting(false);
    }
  };

  const periodCount = Object.values(columnMapping).filter((v) => v === PERIOD).length;
  const mappedCount = headers.filter((h) => (columnMapping[h] ?? UNMAPPED) !== UNMAPPED).length;
  const mappedInputKeys = new Set(Object.values(columnMapping).filter((v) => v !== PERIOD && v !== UNMAPPED));
  const missingRequiredKeys = Object.keys(requiredByInputKey).filter((key) => !mappedInputKeys.has(key));

  const handleSaveMapping = async () => {
    if (!company_id || !selectedSpreadsheetId || !selectedSheetName) return;
    if (periodCount !== 1) {
      toast.error('Tenés que marcar exactamente una columna como "Período (mes)".');
      return;
    }
    setSavingMapping(true);
    try {
      const res = await fetch(SAVE_SHEET_MAPPING_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id,
          spreadsheet_id: selectedSpreadsheetId,
          spreadsheet_name: selectedSpreadsheetName,
          sheet_name: selectedSheetName,
          column_mapping: columnMapping,
        }),
      });
      if (res.status === 400) {
        const err = await parseSheetsError(res);
        if (err.sourceDisabled) {
          setSourcePaused(true);
          return;
        }
        if (err.reconnectRequired) {
          setReconnectRequired(true);
          return;
        }
        if (err.missingHeaders?.length) {
          setStaleHeaders(err.missingHeaders);
          toast.error("Algunas columnas del mapeo ya no existen en la hoja. Revisalas abajo.");
          return;
        }
        if (err.invalidInputKeys?.length) {
          toast.error(`Hay campos que ya no existen: ${err.invalidInputKeys.join(", ")}`);
          return;
        }
        toast.error(err.message ?? "No se pudo guardar el mapeo");
        return;
      }
      if (await handleMembershipError(res)) return;
      toast.success("Mapeo guardado");
      setManualWizard(false);
      await loadStatus();
      await runSync(true);
    } catch {
      toast.error("No se pudo guardar el mapeo");
    } finally {
      setSavingMapping(false);
    }
  };

  const runSync = async (dryRun: boolean) => {
    if (!company_id) return;
    setSyncBusy(true);
    setMissingHeadersAlert(null);
    try {
      const res = await fetch(SYNC_SHEETS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id, dry_run: dryRun }),
      });
      if (res.status === 400) {
        const err = await parseSheetsError(res);
        if (err.sourceDisabled) {
          setSourcePaused(true);
          return;
        }
        if (err.reconnectRequired) {
          setReconnectRequired(true);
          return;
        }
        if (err.missingHeaders?.length) {
          setMissingHeadersAlert(err.missingHeaders);
          return;
        }
        toast.error(err.message ?? "No se pudo sincronizar");
        return;
      }
      if (await handleMembershipError(res)) return;
      const data = (await res.json()) as SyncResult;
      if (data.status === "error" && data.reason === "source_disabled") {
        setSourcePaused(true);
        return;
      }
      setSyncResult(data);
      setSyncWasDryRun(dryRun);
      if (!dryRun) {
        toast.success(
          `Sincronizado: ${data.rows_processed} fila${data.rows_processed === 1 ? "" : "s"} guardada${data.rows_processed === 1 ? "" : "s"}`
        );
        await loadStatus();
        await financial.reloadLogs();
      }
    } catch {
      toast.error("No se pudo sincronizar");
    } finally {
      setSyncBusy(false);
    }
  };

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-8 py-12">
        <BackLink to="/metrics" label="Volver a Growth Tracker" className="mb-6" />
        <PageHeader
          title="Conectar Google Sheets"
          subtitle="Sincronizá tus métricas automáticamente desde una planilla, en vez de cargarlas a mano."
        />

        {sourcePaused && status?.connected && (
          <div className="border border-border bg-surface rounded-lg p-4 mb-6 flex items-start gap-2.5" aria-live="polite">
            <AlertTriangle size={16} strokeWidth={1.5} className="text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Fuente pausada por un administrador</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                CloudValley desactivó temporalmente la sincronización con Google Sheets para tu startup. Tu
                conexión y tu mapeo se conservan tal cual quedaron; pedile a un administrador que la reactive
                para poder sincronizar de nuevo.
              </p>
            </div>
          </div>
        )}

        {!sourcePaused && reconnectRequired && (
          <div className="border border-warning/40 bg-warning/10 rounded-lg p-4 mb-6 flex items-start justify-between gap-4" aria-live="polite">
            <div className="flex items-start gap-2.5">
              <AlertTriangle size={16} strokeWidth={1.5} className="text-warning-foreground shrink-0 mt-0.5" />
              <div>
                <p className="text-sm font-medium">Se perdió el acceso a Google</p>
                <p className="text-xs text-muted-foreground mt-0.5">
                  Volvé a conectar tu cuenta para seguir sincronizando.
                </p>
              </div>
            </div>
            <Button size="sm" onClick={handleConnect} disabled={connecting}>
              {connecting ? "Conectando…" : "Reconectar"}
            </Button>
          </div>
        )}

        {view === "loading" && <LoadingState variant="centered" className="py-16" />}

        {view === "not_connected" && sourcePaused && (
          <EmptyState
            icon={FileSpreadsheet}
            title="Google Sheets está pausado para tu startup"
            description="Un administrador de CloudValley tiene que habilitar esta fuente antes de que puedas conectarte. Pedile que la active."
          />
        )}

        {view === "not_connected" && !sourcePaused && (
          <EmptyState
            icon={FileSpreadsheet}
            title="Todavía no conectaste Google Sheets"
            description="Elegís una planilla, mapeás sus columnas a tus métricas, y a partir de ahí se sincroniza sola una vez por día (o cuando quieras, a mano)."
            action={{ label: connecting ? "Conectando…" : "Conectar Google Sheets", onClick: handleConnect }}
          />
        )}

        {view === "wizard" && loadingEditMapping && <LoadingState variant="centered" className="py-16" />}

        {view === "wizard" && !loadingEditMapping && sourcePaused && (
          <EmptyState
            icon={FileSpreadsheet}
            title="Google Sheets está pausado para tu startup"
            description="Un administrador de CloudValley tiene que reactivar esta fuente antes de que puedas seguir configurando el mapeo."
          />
        )}

        {view === "wizard" && !loadingEditMapping && !sourcePaused && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className={cn(step === 1 && "text-foreground font-medium")}>1. Planilla</span>
              <ChevronRight size={12} strokeWidth={1.5} />
              <span className={cn(step === 2 && "text-foreground font-medium")}>2. Hoja</span>
              <ChevronRight size={12} strokeWidth={1.5} />
              <span className={cn(step === 3 && "text-foreground font-medium")}>3. Mapear columnas</span>
            </div>

            {step === 1 && (() => {
              const filteredSheets = sheets.filter((s) =>
                s.name.toLowerCase().includes(sheetSearch.trim().toLowerCase())
              );
              return (
                <SectionCard title="Elegí una planilla">
                  {loadingSheets ? (
                    <LoadingState />
                  ) : sheets.length === 0 ? (
                    <EmptyState
                      bordered={false}
                      icon={FileSpreadsheet}
                      title="No encontramos planillas en tu cuenta de Google."
                      description="Creá una planilla en Google Sheets con tus datos y volvé a esta pantalla."
                    />
                  ) : (
                    <>
                      {sheets.length > 6 && (
                        <Input
                          value={sheetSearch}
                          onChange={(e) => setSheetSearch(e.target.value)}
                          placeholder="Buscar planilla…"
                          aria-label="Buscar planilla"
                          className="mb-3"
                        />
                      )}
                      {filteredSheets.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">
                          Ninguna planilla coincide con "{sheetSearch}".
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                          {filteredSheets.map((s) => (
                            <button
                              key={s.spreadsheet_id}
                              onClick={() => {
                                setSelectedSpreadsheetId(s.spreadsheet_id);
                                setSelectedSpreadsheetName(s.name);
                                setSelectedSheetName(null);
                                setStep(2);
                              }}
                              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-border hover:border-foreground/30 hover:bg-surface transition-colors text-left"
                            >
                              <span className="flex items-center gap-2 text-sm min-w-0">
                                <FileSpreadsheet size={14} strokeWidth={1.5} className="shrink-0 text-muted-foreground" />
                                <span className="truncate">{s.name}</span>
                              </span>
                              <ChevronRight size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <div className="mt-4">
                    <Button variant="ghost" onClick={cancelWizard}>
                      Cancelar
                    </Button>
                  </div>
                </SectionCard>
              );
            })()}

            {step === 2 && (() => {
              const filteredTabs = tabs.filter((t) => t.toLowerCase().includes(tabSearch.trim().toLowerCase()));
              return (
                <SectionCard title="Elegí la hoja" description={selectedSpreadsheetName}>
                  {loadingTabs ? (
                    <LoadingState />
                  ) : tabs.length === 0 ? (
                    <EmptyState bordered={false} icon={FileSpreadsheet} title="Esta planilla no tiene hojas." />
                  ) : (
                    <>
                      {tabs.length > 8 && (
                        <Input
                          value={tabSearch}
                          onChange={(e) => setTabSearch(e.target.value)}
                          placeholder="Buscar hoja…"
                          aria-label="Buscar hoja"
                          className="mb-3"
                        />
                      )}
                      {filteredTabs.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6">
                          Ninguna hoja coincide con "{tabSearch}".
                        </p>
                      ) : (
                        <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                          {filteredTabs.map((t) => (
                            <button
                              key={t}
                              onClick={() => {
                                setSelectedSheetName(t);
                                setStep(3);
                              }}
                              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-border hover:border-foreground/30 hover:bg-surface transition-colors text-left"
                            >
                              <span className="text-sm">{t}</span>
                              <ChevronRight size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                            </button>
                          ))}
                        </div>
                      )}
                    </>
                  )}
                  <div className="mt-4">
                    <Button variant="ghost" onClick={() => setStep(1)}>
                      Atrás
                    </Button>
                  </div>
                </SectionCard>
              );
            })()}

            {step === 3 && (
              <SectionCard
                title="Mapeá las columnas"
                description={
                  headers.length > 0
                    ? `${selectedSpreadsheetName} · ${selectedSheetName} · ${mappedCount} de ${headers.length} mapeadas`
                    : `${selectedSpreadsheetName} · ${selectedSheetName}`
                }
              >
                {!loadingHeaders && headers.length > 0 && (
                  <p className="text-xs text-muted-foreground mb-3">
                    Ya adivinamos algunas columnas por su nombre. Revisá y ajustá lo que haga falta.
                  </p>
                )}
                {staleHeaders.length > 0 && (
                  <div className="border border-warning/40 bg-warning/10 rounded-md p-3 mb-4 text-xs" aria-live="polite">
                    <p className="font-medium">Estas columnas del mapeo guardado ya no están en la hoja:</p>
                    <p className="text-muted-foreground mt-0.5">{staleHeaders.join(", ")}</p>
                  </div>
                )}
                {!loadingHeaders && missingRequiredKeys.length > 0 && (
                  <div className="border border-warning/40 bg-warning/10 rounded-md p-3 mb-4 text-xs" aria-live="polite">
                    <p className="font-medium">
                      Tus métricas calculadas necesitan estos campos y todavía no están mapeados:
                    </p>
                    <ul className="mt-1 space-y-0.5 text-muted-foreground">
                      {missingRequiredKeys.map((key) => {
                        const def = inputDefs.find((d) => d.input_key === key);
                        return (
                          <li key={key}>
                            <span className="font-mono text-foreground">{key}</span>
                            {def && ` (${def.name})`}: usado en {requiredByInputKey[key].join(", ")}.
                          </li>
                        );
                      })}
                    </ul>
                  </div>
                )}
                {loadingHeaders ? (
                  <LoadingState />
                ) : headers.length === 0 ? (
                  <EmptyState bordered={false} icon={FileSpreadsheet} title="Esta hoja no tiene columnas en la primera fila." />
                ) : (
                  <div className="space-y-1 max-h-96 overflow-y-auto pr-1">
                    {headers.map((header) => {
                      const current = columnMapping[header] ?? UNMAPPED;
                      const periodTakenElsewhere = Object.entries(columnMapping).some(
                        ([h, v]) => h !== header && v === PERIOD
                      );
                      const usedElsewhere = new Set(
                        Object.entries(columnMapping)
                          .filter(([h]) => h !== header)
                          .map(([, v]) => v)
                      );
                      return (
                        <ColumnMappingRow
                          key={header}
                          header={header}
                          value={current}
                          onChange={(v) => setColumnMapping((prev) => ({ ...prev, [header]: v }))}
                          inputDefs={inputDefs}
                          periodTaken={periodTakenElsewhere}
                          usedInputKeys={usedElsewhere}
                          requiredByInputKey={requiredByInputKey}
                        />
                      );
                    })}
                  </div>
                )}
                {!loadingHeaders && headers.length > 0 && (
                  <p className="text-xs text-muted-foreground pt-3">
                    {periodCount === 1
                      ? "Listo: una columna está marcada como Período."
                      : periodCount === 0
                        ? "Falta marcar una columna como Período (mes)."
                        : "Marcaste más de una columna como Período: dejá solo una."}
                  </p>
                )}
                <FormActions
                  className="mt-4"
                  onCancel={() => setStep(2)}
                  cancelLabel="Atrás"
                  onSubmit={handleSaveMapping}
                  submitLabel="Guardar mapeo"
                  busy={savingMapping}
                  disabled={headers.length === 0 || periodCount !== 1}
                  extra={
                    <Button variant="ghost" onClick={cancelWizard}>
                      Cancelar
                    </Button>
                  }
                />
              </SectionCard>
            )}
          </div>
        )}

        {view === "status" && status && (
          <div className="space-y-6">
            <SectionCard
              title="Conexión"
              action={
                <Button variant="outline" size="sm" onClick={() => setConfirmDisconnect(true)}>
                  <Unlink size={12} className="mr-1.5" /> Desconectar
                </Button>
              }
            >
              <div className="divide-y divide-border">
                <InfoRow label="Cuenta de Google" value={status.google_account_email ?? "—"} />
                <InfoRow
                  label="Planilla"
                  value={
                    <span className="inline-flex items-center gap-1.5">
                      <FileSpreadsheet size={13} strokeWidth={1.5} className="text-muted-foreground" />
                      {status.status ?? "—"}
                    </span>
                  }
                  action={
                    <Button variant="ghost" size="sm" onClick={openEditMapping} disabled={sourcePaused}>
                      Editar mapeo
                    </Button>
                  }
                />
                <InfoRow
                  label="Última sincronización"
                  value={status.last_synced_at ? new Date(status.last_synced_at).toLocaleString("es-AR") : "Todavía no sincronizó"}
                  action={
                    status.last_sync_status && (
                      <Badge variant={status.last_sync_status === "success" ? "success" : "destructive"}>
                        {status.last_sync_status === "success" ? (
                          <CheckCircle2 size={12} className="mr-1" />
                        ) : (
                          <AlertTriangle size={12} className="mr-1" />
                        )}
                        {status.last_sync_status}
                      </Badge>
                    )
                  }
                />
              </div>

              <div className="flex items-center gap-2 mt-4 pt-4 border-t border-border">
                <Button onClick={() => runSync(false)} disabled={syncBusy || sourcePaused}>
                  <RefreshCw size={14} className={cn("mr-1.5", syncBusy && "animate-spin")} />
                  {syncBusy && !syncWasDryRun ? "Sincronizando…" : "Sincronizar ahora"}
                </Button>
                <Button variant="outline" onClick={() => runSync(true)} disabled={syncBusy || sourcePaused}>
                  {syncBusy && syncWasDryRun ? "Probando…" : "Probar mapeo"}
                </Button>
              </div>
              <p className="text-xs text-muted-foreground mt-2">
                También se sincroniza sola, una vez por día. No hace falta entrar a hacerlo a mano.
              </p>
            </SectionCard>

            {missingHeadersAlert && missingHeadersAlert.length > 0 && (
              <div className="border border-destructive/40 bg-destructive/5 rounded-lg p-4" aria-live="polite">
                <p className="text-sm font-medium text-destructive">La planilla cambió de estructura</p>
                <p className="text-xs text-muted-foreground mt-1">
                  Estas columnas del mapeo ya no existen en la hoja: {missingHeadersAlert.join(", ")}.
                </p>
                <Button size="sm" className="mt-3" onClick={openEditMapping}>
                  Editar mapeo
                </Button>
              </div>
            )}

            {syncResult && (
              <div
                className={cn(
                  "border rounded-lg p-4",
                  syncResult.rows_rejected > 0 ? "border-warning/40 bg-warning/10" : "border-success/40 bg-success/10"
                )}
                aria-live="polite"
              >
                <p className="text-sm font-medium">
                  {syncWasDryRun ? "Resultado de la prueba (no se guardó nada)" : "Última sincronización"}
                </p>
                <p className="text-xs text-muted-foreground mt-1">
                  {syncResult.rows_processed} fila{syncResult.rows_processed === 1 ? "" : "s"} procesada
                  {syncResult.rows_processed === 1 ? "" : "s"}
                  {syncResult.rows_rejected > 0 &&
                    ` · ${syncResult.rows_rejected} rechazada${syncResult.rows_rejected === 1 ? "" : "s"}`}
                </p>
                {syncResult.row_errors.length > 0 && (
                  <ul className="mt-3 pt-3 border-t border-border/50 space-y-1">
                    {syncResult.row_errors.map((e, i) => (
                      <li key={i} className="text-xs text-destructive">
                        {(e.row !== undefined || e.period) && (
                          <span className="text-muted-foreground">
                            {e.row !== undefined ? `Fila ${e.row}` : ""}
                            {e.row !== undefined && e.period ? " · " : ""}
                            {e.period ?? ""}
                            {": "}
                          </span>
                        )}
                        <span className="font-medium">{e.field}</span>: {e.reason}
                      </li>
                    ))}
                  </ul>
                )}
              </div>
            )}

            <div>
              <h3 className="text-xs font-medium text-foreground uppercase tracking-wide mb-3">Historial de cargas</h3>
              {financial.loadingLogs ? (
                <LoadingState />
              ) : (
                <ImportLogTable logs={financial.logs} emptyLabel="Todavía no se sincronizó ningún dato." />
              )}
            </div>
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={confirmDisconnect}
        onOpenChange={setConfirmDisconnect}
        title="Desconectar Google Sheets"
        description="Se revoca el acceso de CloudValley a tu cuenta de Google y se corta la sincronización automática. El mapeo y los datos ya sincronizados no se borran; si te reconectás después, seguís desde donde quedaste."
        confirmLabel="Desconectar"
        variant="destructive"
        busy={disconnecting}
        onConfirm={handleDisconnect}
      />
    </AppLayout>
  );
}

// Searchable combobox per sheet column — same Popover+Command pattern as
// FormulaField's variable picker, on purpose: with custom metrics now
// unlimited, a plain <select> forces scanning the whole list per column.
function ColumnMappingRow({
  header,
  value,
  onChange,
  inputDefs,
  periodTaken,
  usedInputKeys,
  requiredByInputKey,
}: {
  header: string;
  value: string;
  onChange: (v: string) => void;
  inputDefs: MetricDef[];
  periodTaken: boolean;
  usedInputKeys: Set<string>;
  requiredByInputKey: Record<string, string[]>;
}) {
  const [open, setOpen] = useState(false);

  const currentLabel =
    value === UNMAPPED
      ? "No usar esta columna"
      : value === PERIOD
        ? "Período (mes)"
        : (inputDefs.find((d) => d.input_key === value)?.name ?? value);

  return (
    <div className="flex items-center gap-3 py-1.5">
      <span className="text-sm font-mono truncate flex-1 min-w-0">{header}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            size="sm"
            className="w-60 h-9 shrink-0 justify-between font-normal"
            aria-label={`Mapeo para la columna ${header}`}
          >
            <span className="truncate">{currentLabel}</span>
            <ChevronsUpDown size={12} className="opacity-50 shrink-0" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-72 p-0" align="end">
          <Command>
            <CommandInput placeholder="Buscar métrica…" />
            <CommandList>
              <CommandEmpty>Sin resultados.</CommandEmpty>
              <CommandGroup>
                <CommandItem
                  value="no usar sin mapear ignorar"
                  onSelect={() => {
                    onChange(UNMAPPED);
                    setOpen(false);
                  }}
                >
                  No usar esta columna
                </CommandItem>
                <CommandItem
                  value="periodo mes fecha"
                  disabled={periodTaken && value !== PERIOD}
                  onSelect={() => {
                    onChange(PERIOD);
                    setOpen(false);
                  }}
                >
                  Período (mes)
                </CommandItem>
              </CommandGroup>
              {inputDefs.length > 0 && (
                <CommandGroup heading="Métricas">
                  {inputDefs.map((d) => {
                    const requiredIn = requiredByInputKey[d.input_key!];
                    return (
                      <CommandItem
                        key={d.input_key}
                        value={`${d.name} ${d.input_key}`}
                        disabled={usedInputKeys.has(d.input_key!) && value !== d.input_key}
                        onSelect={() => {
                          onChange(d.input_key!);
                          setOpen(false);
                        }}
                        className="flex items-center justify-between gap-3"
                      >
                        <span className="min-w-0">
                          <span className="block truncate">{d.name}</span>
                          {requiredIn && (
                            <span className="block text-[10px] text-tertiary truncate">
                              Usada en {requiredIn.join(", ")}
                            </span>
                          )}
                        </span>
                        <span className="text-[10px] font-mono text-tertiary shrink-0">{d.input_key}</span>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>
    </div>
  );
}
