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
  Plus,
  Trash2,
  X,
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
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialMetrics } from "@/hooks/useFinancialMetrics";
import { handleMembershipError } from "@/lib/membership";
import { requiredInputs } from "@/lib/formulaEngine";
import { groupRowErrors } from "@/lib/financialData";
import { cn } from "@/lib/utils";
import type { MetricDef } from "@/lib/metrics";
import {
  LIST_GOOGLE_ACCOUNTS_URL,
  CONNECT_SHEETS_URL,
  LIST_SHEETS_URL,
  GET_SHEET_TABS_URL,
  GET_SHEET_HEADERS_URL,
  SAVE_SHEET_MAPPING_URL,
  LIST_SHEET_CONNECTIONS_URL,
  REMOVE_SHEET_CONNECTION_URL,
  SYNC_SHEETS_URL,
  DISCONNECT_SHEETS_URL,
  parseSheetsError,
  AGGREGATION_LABELS,
  type GoogleAccount,
  type GoogleAccountsResponse,
  type SheetSummary,
  type Aggregation,
  type MetricFilter,
  type MetricMappingConfig,
  type SheetConnection,
  type SyncResult,
} from "@/lib/sheetsIntegration";

const PERIOD_PATTERNS = ["periodo", "period", "mes", "month", "fecha", "date"];

type WizardStep = 1 | 2 | 3;

// Local editing shape for a metric config: aggregation starts unset (no
// sensible default per the backend contract — sum/count/last mean very
// different things) until the user picks one or auto-map guesses "last".
type DraftMetricConfig = {
  _id: string;
  input_key: string;
  aggregation: Aggregation | "";
  value_column?: string;
  distinct_column?: string;
  filters: MetricFilter[];
};

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
// "last" is the auto-picked aggregation for a matched column — it reproduces
// the old flat-mapping behavior (one row per period = the value), the most
// common case; transaction logs need the user to pick sum/count themselves.
function autoMapHeaders(
  headers: string[],
  inputDefs: MetricDef[]
): { periodColumn: string | null; metricConfigs: DraftMetricConfig[] } {
  let periodColumn: string | null = null;
  const metricConfigs: DraftMetricConfig[] = [];
  const usedKeys = new Set<string>();
  for (const header of headers) {
    const norm = normalizeForMatch(header);
    if (!periodColumn && PERIOD_PATTERNS.includes(norm)) {
      periodColumn = header;
      continue;
    }
    const match = inputDefs.find(
      (d) =>
        d.input_key &&
        !usedKeys.has(d.input_key) &&
        (normalizeForMatch(d.input_key) === norm || normalizeForMatch(d.name) === norm)
    );
    if (match?.input_key) {
      usedKeys.add(match.input_key);
      metricConfigs.push({
        _id: crypto.randomUUID(),
        input_key: match.input_key,
        aggregation: "last",
        value_column: header,
        filters: [],
      });
    }
  }
  return { periodColumn, metricConfigs };
}

function timeAgo(iso: string | null) {
  if (!iso) return "todavía no sincronizó";
  const diff = Date.now() - new Date(iso).getTime();
  const m = Math.floor(diff / 60000);
  if (m < 1) return "hace segundos";
  if (m < 60) return `hace ${m}m`;
  const h = Math.floor(m / 60);
  if (h < 24) return `hace ${h}h`;
  return `hace ${Math.floor(h / 24)}d`;
}

export default function GrowthTrackerSheets() {
  const { user, loading, company_id } = useAuth();
  const financial = useFinancialMetrics(company_id);
  const [searchParams, setSearchParams] = useSearchParams();

  const [accounts, setAccounts] = useState<GoogleAccount[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  // A nivel company (assign-source, un admin la prende/apaga) — llega
  // incluso con accounts: [] para poder distinguir "todavía no conectaste
  // nada" de "está pausado, no podés conectar todavía".
  const [sourcePaused, setSourcePaused] = useState(false);
  const [connections, setConnections] = useState<SheetConnection[]>([]);
  const [loadingConnections, setLoadingConnections] = useState(true);
  const [connecting, setConnecting] = useState(false);
  const [confirmDisconnectAccount, setConfirmDisconnectAccount] = useState<GoogleAccount | null>(null);
  const [disconnectingAccountId, setDisconnectingAccountId] = useState<string | null>(null);
  const [confirmRemoveConnection, setConfirmRemoveConnection] = useState<SheetConnection | null>(null);
  const [removingConnectionId, setRemovingConnectionId] = useState<string | null>(null);

  // Non-null wizardAccountId means the "agregar/editar hoja" wizard is open,
  // scoped to that account. editingConnectionId distinguishes "creating a
  // new connection" (null) from "editing an existing one".
  const [wizardAccountId, setWizardAccountId] = useState<string | null>(null);
  const [editingConnectionId, setEditingConnectionId] = useState<string | null>(null);
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
  const [periodColumn, setPeriodColumn] = useState<string | null>(null);
  const [metricConfigs, setMetricConfigs] = useState<DraftMetricConfig[]>([]);
  const [staleHeaders, setStaleHeaders] = useState<string[]>([]);
  const [savingMapping, setSavingMapping] = useState(false);
  const [loadingEditConnection, setLoadingEditConnection] = useState(false);

  // Per-connection sync state — each connection card syncs/tests
  // independently, and "Sincronizar todo" fills several of these at once.
  const [syncBusyConnectionId, setSyncBusyConnectionId] = useState<string | null>(null);
  const [syncAllBusy, setSyncAllBusy] = useState(false);
  const [syncResults, setSyncResults] = useState<Record<string, { result: SyncResult; wasDryRun: boolean }>>({});
  const [missingHeadersByConnection, setMissingHeadersByConnection] = useState<Record<string, string[]>>({});

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

  const usedInputKeySet = new Set(metricConfigs.map((m) => m.input_key).filter(Boolean));
  const missingRequiredKeys = Object.keys(requiredByInputKey).filter((key) => !usedInputKeySet.has(key));
  const usedHeaderSet = useMemo(() => {
    const set = new Set<string>();
    if (periodColumn) set.add(periodColumn);
    for (const m of metricConfigs) {
      if (m.value_column) set.add(m.value_column);
      if (m.distinct_column) set.add(m.distinct_column);
      for (const f of m.filters) if (f.column) set.add(f.column);
    }
    return set;
  }, [periodColumn, metricConfigs]);
  const duplicateInputKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const m of metricConfigs) if (m.input_key) counts.set(m.input_key, (counts.get(m.input_key) ?? 0) + 1);
    return Array.from(counts.entries())
      .filter(([, c]) => c > 1)
      .map(([k]) => k);
  }, [metricConfigs]);
  const allConfigsValid = metricConfigs.every((m) => {
    if (!m.input_key || !m.aggregation) return false;
    if ((m.aggregation === "sum" || m.aggregation === "last" || m.aggregation === "average") && !m.value_column)
      return false;
    if (m.aggregation === "count_distinct" && !m.distinct_column) return false;
    return true;
  });
  const canSaveMapping = !!periodColumn && metricConfigs.length > 0 && allConfigsValid && duplicateInputKeys.length === 0;

  const wizardAccount = accounts.find((a) => a.account_id === wizardAccountId) ?? null;
  const connectionsByAccount = useMemo(() => {
    const map = new Map<string, SheetConnection[]>();
    for (const c of connections) {
      const list = map.get(c.account_id) ?? [];
      list.push(c);
      map.set(c.account_id, list);
    }
    return map;
  }, [connections]);

  const loadAccounts = async () => {
    if (!company_id) return;
    setLoadingAccounts(true);
    try {
      const res = await fetch(`${LIST_GOOGLE_ACCOUNTS_URL}?company_id=${encodeURIComponent(company_id)}`, {
        credentials: "include",
      });
      if (await handleMembershipError(res)) return;
      const data = (await res.json()) as GoogleAccountsResponse;
      setAccounts(Array.isArray(data?.accounts) ? data.accounts : []);
      setSourcePaused(data?.source_enabled === false);
    } catch {
      toast.error("No se pudieron cargar las cuentas de Google conectadas");
    } finally {
      setLoadingAccounts(false);
    }
  };

  const loadConnections = async () => {
    if (!company_id) return;
    setLoadingConnections(true);
    try {
      const res = await fetch(`${LIST_SHEET_CONNECTIONS_URL}?company_id=${encodeURIComponent(company_id)}`, {
        credentials: "include",
      });
      if (await handleMembershipError(res)) return;
      const data = await res.json();
      setConnections(Array.isArray(data?.connections) ? data.connections : []);
    } catch {
      toast.error("No se pudieron cargar las hojas conectadas");
    } finally {
      setLoadingConnections(false);
    }
  };

  // Handle the OAuth redirect back from Google (?connected=1&account_id=... /
  // ?error=1&account_id=...), once.
  useEffect(() => {
    const connected = searchParams.get("connected");
    const error = searchParams.get("error");
    if (connected) toast.success("Cuenta de Google conectada.");
    if (error) toast.error("No se pudo conectar con Google. Intentá de nuevo.");
    if (connected || error) setSearchParams({}, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    loadAccounts();
    loadConnections();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [company_id]);

  // Deep link from InputsPanel/AnnualGrid's "se sincroniza desde X" badge
  // (?connection_id=...) — jump straight into editing that connection
  // instead of leaving the user to find it in the list themselves.
  const deepLinkHandledRef = useRef(false);
  useEffect(() => {
    if (deepLinkHandledRef.current) return;
    if (loadingConnections) return;
    const target = searchParams.get("connection_id");
    if (!target) {
      deepLinkHandledRef.current = true;
      return;
    }
    const conn = connections.find((c) => c.connection_id === target);
    deepLinkHandledRef.current = true;
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete("connection_id");
      return next;
    }, { replace: true });
    if (conn) openEditConnection(conn);
    else toast.error("No encontramos esa conexión. Puede que se haya quitado.");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [loadingConnections, connections]);

  const loadSheets = async (accountId: string) => {
    if (!company_id) return;
    setLoadingSheets(true);
    try {
      const qs = `?company_id=${encodeURIComponent(company_id)}&account_id=${encodeURIComponent(accountId)}`;
      const res = await fetch(`${LIST_SHEETS_URL}${qs}`, { credentials: "include" });
      if (res.status === 400) {
        const err = await parseSheetsError(res);
        if (err.reconnectRequired || err.sourceDisabled) {
          await loadAccounts();
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

  const loadTabs = async (accountId: string, spreadsheetId: string) => {
    if (!company_id) return;
    setLoadingTabs(true);
    try {
      const qs = `?company_id=${encodeURIComponent(company_id)}&account_id=${encodeURIComponent(accountId)}&spreadsheet_id=${encodeURIComponent(spreadsheetId)}`;
      const res = await fetch(`${GET_SHEET_TABS_URL}${qs}`, { credentials: "include" });
      if (res.status === 400) {
        const err = await parseSheetsError(res);
        if (err.reconnectRequired || err.sourceDisabled) {
          await loadAccounts();
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

  const loadHeaders = async (
    accountId: string,
    spreadsheetId: string,
    sheetName: string,
    seed?: SheetConnection | null
  ) => {
    if (!company_id) return;
    setLoadingHeaders(true);
    try {
      const qs = `?company_id=${encodeURIComponent(company_id)}&account_id=${encodeURIComponent(accountId)}&spreadsheet_id=${encodeURIComponent(spreadsheetId)}&sheet_name=${encodeURIComponent(sheetName)}`;
      const res = await fetch(`${GET_SHEET_HEADERS_URL}${qs}`, { credentials: "include" });
      if (res.status === 400) {
        const err = await parseSheetsError(res);
        if (err.reconnectRequired || err.sourceDisabled) {
          await loadAccounts();
          return;
        }
        toast.error(err.message ?? "No se pudieron leer las columnas de la hoja");
        return;
      }
      if (await handleMembershipError(res)) return;
      const data = await res.json();
      const hs: string[] = Array.isArray(data?.headers) ? data.headers : [];
      setHeaders(hs);
      if (seed) {
        const missing: string[] = [];
        const seededPeriod = hs.includes(seed.period_column) ? seed.period_column : null;
        if (!seededPeriod) missing.push(seed.period_column);
        const seededMetrics: DraftMetricConfig[] = seed.metrics.map((m) => {
          const cols = [m.value_column, m.distinct_column, ...(m.filters?.map((f) => f.column) ?? [])].filter(
            (c): c is string => !!c
          );
          for (const c of cols) if (!hs.includes(c)) missing.push(c);
          return { _id: crypto.randomUUID(), ...m, filters: m.filters ?? [] };
        });
        setPeriodColumn(seededPeriod);
        setMetricConfigs(seededMetrics);
        setStaleHeaders(Array.from(new Set(missing)));
      } else {
        const auto = autoMapHeaders(hs, inputDefs);
        setPeriodColumn(auto.periodColumn);
        setMetricConfigs(auto.metricConfigs);
        setStaleHeaders([]);
      }
    } catch {
      toast.error("No se pudieron leer las columnas de la hoja");
    } finally {
      setLoadingHeaders(false);
    }
  };

  // loadTabs/loadHeaders are deliberately called directly from the click
  // (or from openEditConnection) instead of a useEffect keyed off the
  // selected spreadsheet/sheet: picking the same one twice in a row (e.g.
  // go back, then re-select it) sets the exact same value, React bails out
  // of the state update, and an effect watching that value would never
  // re-fire — the old list would just sit there looking "selected" but
  // stale. A direct call guarantees a fresh fetch every time.

  const resetWizardData = () => {
    setStep(1);
    setSelectedSpreadsheetId(null);
    setSelectedSpreadsheetName("");
    setTabs([]);
    setSelectedSheetName(null);
    setHeaders([]);
    setPeriodColumn(null);
    setMetricConfigs([]);
    setStaleHeaders([]);
    setSheetSearch("");
    setTabSearch("");
  };

  const openAddConnection = (accountId: string) => {
    resetWizardData();
    setEditingConnectionId(null);
    setWizardAccountId(accountId);
    loadSheets(accountId);
  };

  const openEditConnection = (conn: SheetConnection) => {
    resetWizardData();
    setEditingConnectionId(conn.connection_id);
    setWizardAccountId(conn.account_id);
    setSelectedSpreadsheetId(conn.spreadsheet_id);
    setSelectedSpreadsheetName(conn.spreadsheet_name);
    setSelectedSheetName(conn.sheet_name);
    setStep(3);
    setLoadingEditConnection(true);
    Promise.all([
      loadSheets(conn.account_id),
      loadTabs(conn.account_id, conn.spreadsheet_id),
      loadHeaders(conn.account_id, conn.spreadsheet_id, conn.sheet_name, conn),
    ]).finally(() => setLoadingEditConnection(false));
  };

  const cancelWizard = () => {
    setWizardAccountId(null);
    setEditingConnectionId(null);
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
      if (res.status === 400) {
        const err = await parseSheetsError(res);
        if (err.sourceDisabled) {
          setSourcePaused(true);
          toast.error("Un administrador de CloudValley pausó esta fuente. Pedile que la reactive.");
          return;
        }
        toast.error(err.message ?? "No se pudo iniciar la conexión con Google");
        return;
      }
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

  const handleDisconnectAccount = async () => {
    if (!company_id || !confirmDisconnectAccount) return;
    const accountId = confirmDisconnectAccount.account_id;
    setDisconnectingAccountId(accountId);
    try {
      const res = await fetch(DISCONNECT_SHEETS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id, account_id: accountId }),
      });
      if (await handleMembershipError(res)) return;
      toast.success("Cuenta desconectada");
      setConfirmDisconnectAccount(null);
      await Promise.all([loadAccounts(), loadConnections()]);
    } catch {
      toast.error("No se pudo desconectar la cuenta");
    } finally {
      setDisconnectingAccountId(null);
    }
  };

  const handleRemoveConnection = async () => {
    if (!company_id || !confirmRemoveConnection) return;
    const connectionId = confirmRemoveConnection.connection_id;
    setRemovingConnectionId(connectionId);
    try {
      const res = await fetch(REMOVE_SHEET_CONNECTION_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id, connection_id: connectionId }),
      });
      if (await handleMembershipError(res)) return;
      toast.success("Hoja quitada");
      setConfirmRemoveConnection(null);
      await loadConnections();
    } catch {
      toast.error("No se pudo quitar la hoja");
    } finally {
      setRemovingConnectionId(null);
    }
  };

  const handleSaveMapping = async () => {
    if (!company_id || !wizardAccountId || !selectedSpreadsheetId || !selectedSheetName || !periodColumn) return;
    if (!canSaveMapping) {
      toast.error("Revisá el mapeo: hay métricas incompletas o repetidas.");
      return;
    }
    setSavingMapping(true);
    try {
      const metrics: MetricMappingConfig[] = metricConfigs.map((m) => {
        const cfg: MetricMappingConfig = { input_key: m.input_key, aggregation: m.aggregation as Aggregation };
        if (m.aggregation === "sum" || m.aggregation === "last" || m.aggregation === "average") {
          cfg.value_column = m.value_column;
        }
        if (m.aggregation === "count_distinct") {
          cfg.distinct_column = m.distinct_column;
        }
        const filters = m.filters.filter((f) => f.column && f.values.length > 0);
        if (filters.length > 0) cfg.filters = filters;
        return cfg;
      });
      const res = await fetch(SAVE_SHEET_MAPPING_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id,
          account_id: wizardAccountId,
          connection_id: editingConnectionId ?? undefined,
          spreadsheet_id: selectedSpreadsheetId,
          spreadsheet_name: selectedSpreadsheetName,
          sheet_name: selectedSheetName,
          period_column: periodColumn,
          metrics,
        }),
      });
      if (res.status === 400) {
        const err = await parseSheetsError(res);
        if (err.sourceDisabled || err.reconnectRequired) {
          await loadAccounts();
          return;
        }
        if (err.missingHeaders?.length) {
          setStaleHeaders(err.missingHeaders);
          toast.error("Algunas columnas del mapeo ya no existen en la hoja. Revisalas abajo.");
          return;
        }
        if (err.invalidInputKeys?.length) {
          toast.error(`Hay métricas que ya no existen: ${err.invalidInputKeys.join(", ")}`);
          return;
        }
        if (err.duplicateInputKeys?.length) {
          toast.error(`Hay métricas repetidas en el mapeo: ${err.duplicateInputKeys.join(", ")}`);
          return;
        }
        if (err.duplicateInputKeysAcrossConnections?.length) {
          toast.error(
            `Estas métricas ya están mapeadas en otra conexión: ${err.duplicateInputKeysAcrossConnections.join(", ")}. Sacalas de ahí primero.`
          );
          return;
        }
        if (err.invalidAggregations?.length) {
          toast.error(
            `Combinación inválida: ${err.invalidAggregations.map((a) => `${a.input_key} (${a.aggregation})`).join(", ")}`
          );
          return;
        }
        if (err.missingValueColumn?.length) {
          toast.error(`Falta la columna con el valor para: ${err.missingValueColumn.join(", ")}`);
          return;
        }
        if (err.missingDistinctColumn?.length) {
          toast.error(`Falta la columna de valores únicos para: ${err.missingDistinctColumn.join(", ")}`);
          return;
        }
        if (err.malformedFilters?.length) {
          toast.error("Hay filtros mal formados en el mapeo. Revisalos.");
          return;
        }
        toast.error(err.message ?? "No se pudo guardar el mapeo");
        return;
      }
      if (await handleMembershipError(res)) return;
      toast.success("Mapeo guardado");
      await loadConnections();
      // El connection_id de una conexión nueva no vuelve en la respuesta de
      // save-sheet-mapping — se busca en la lista recién recargada por la
      // combinación que la identifica unívocamente, para poder probarla en
      // el acto en vez de dejar al usuario sin feedback inmediato.
      let syncTargetId = editingConnectionId;
      if (!syncTargetId) {
        const res2 = await fetch(`${LIST_SHEET_CONNECTIONS_URL}?company_id=${encodeURIComponent(company_id)}`, {
          credentials: "include",
        });
        if (res2.ok) {
          const data2 = await res2.json();
          const list: SheetConnection[] = Array.isArray(data2?.connections) ? data2.connections : [];
          const match = list.find(
            (c) =>
              c.account_id === wizardAccountId &&
              c.spreadsheet_id === selectedSpreadsheetId &&
              c.sheet_name === selectedSheetName
          );
          syncTargetId = match?.connection_id ?? null;
        }
      }
      cancelWizard();
      if (syncTargetId) await runConnectionSync(syncTargetId, true);
    } catch {
      toast.error("No se pudo guardar el mapeo");
    } finally {
      setSavingMapping(false);
    }
  };

  const runConnectionSync = async (connectionId: string, dryRun: boolean) => {
    if (!company_id) return;
    setSyncBusyConnectionId(connectionId);
    setMissingHeadersByConnection((prev) => {
      const next = { ...prev };
      delete next[connectionId];
      return next;
    });
    try {
      const res = await fetch(SYNC_SHEETS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id, connection_id: connectionId, dry_run: dryRun }),
      });
      if (res.status === 400) {
        const err = await parseSheetsError(res);
        if (err.sourceDisabled || err.reconnectRequired) {
          await loadAccounts();
          return;
        }
        if (err.missingHeaders?.length) {
          setMissingHeadersByConnection((prev) => ({ ...prev, [connectionId]: err.missingHeaders! }));
          return;
        }
        toast.error(err.message ?? "No se pudo sincronizar");
        return;
      }
      if (await handleMembershipError(res)) return;
      const data = (await res.json()) as SyncResult;
      if (data.status === "error" && data.reason === "source_disabled") {
        await loadAccounts();
        return;
      }
      setSyncResults((prev) => ({ ...prev, [connectionId]: { result: data, wasDryRun: dryRun } }));
      const failed = data.status === "error" || (data.rows_processed === 0 && data.rows_rejected > 0);
      if (!dryRun) {
        if (failed) {
          toast.error("No se pudo sincronizar nada. Revisá el detalle abajo.");
        } else if (data.rows_rejected > 0) {
          toast.error(
            `Sincronizado con errores: ${data.rows_processed} guardada${data.rows_processed === 1 ? "" : "s"}, ${data.rows_rejected} rechazada${data.rows_rejected === 1 ? "" : "s"}.`
          );
        } else {
          toast.success(
            `Sincronizado: ${data.rows_processed} fila${data.rows_processed === 1 ? "" : "s"} guardada${data.rows_processed === 1 ? "" : "s"}`
          );
        }
        await loadConnections();
        await financial.reloadLogs();
      }
    } catch {
      toast.error("No se pudo sincronizar");
    } finally {
      setSyncBusyConnectionId(null);
    }
  };

  const runSyncAll = async (dryRun: boolean) => {
    if (!company_id) return;
    setSyncAllBusy(true);
    try {
      const res = await fetch(SYNC_SHEETS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id, dry_run: dryRun }),
      });
      if (await handleMembershipError(res)) return;
      const data = await res.json();
      const results: SyncResult[] = Array.isArray(data?.results) ? data.results : [];
      setSyncResults((prev) => {
        const next = { ...prev };
        for (const r of results) if (r.connection_id) next[r.connection_id] = { result: r, wasDryRun: dryRun };
        return next;
      });
      const failedCount = results.filter(
        (r) => r.status === "error" || (r.rows_processed === 0 && r.rows_rejected > 0)
      ).length;
      if (!dryRun) {
        if (results.length === 0) {
          toast.error("No hay ninguna hoja conectada para sincronizar todavía.");
        } else if (failedCount === 0) {
          toast.success(`Sincronizado: ${results.length} conexión${results.length === 1 ? "" : "es"} al día.`);
        } else {
          toast.error(`Sincronizado con errores: ${failedCount} de ${results.length} conexiones fallaron.`);
        }
        await loadConnections();
        await financial.reloadLogs();
      }
    } catch {
      toast.error("No se pudo sincronizar");
    } finally {
      setSyncAllBusy(false);
    }
  };

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;

  const showWizard = wizardAccountId !== null;
  const anyConnections = connections.length > 0;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-8 py-12">
        <BackLink to="/metrics" label="Volver a Growth Tracker" className="mb-6" />
        <PageHeader
          title="Conectar Google Sheets"
          subtitle="Sincronizá tus métricas automáticamente desde una o más planillas, en vez de cargarlas a mano."
          action={
            !showWizard && !loadingAccounts && accounts.length > 0 ? (
              <div className="flex items-center gap-2">
                {anyConnections && (
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => runSyncAll(false)}
                    disabled={syncAllBusy || sourcePaused}
                  >
                    <RefreshCw size={13} className={cn("mr-1.5", syncAllBusy && "animate-spin")} />
                    {syncAllBusy ? "Sincronizando…" : "Sincronizar todo"}
                  </Button>
                )}
                <Button size="sm" onClick={handleConnect} disabled={connecting || sourcePaused}>
                  <Plus size={13} className="mr-1.5" />
                  {connecting ? "Conectando…" : "Conectar otra cuenta"}
                </Button>
              </div>
            ) : undefined
          }
        />

        {(loadingAccounts || loadingConnections) && !showWizard && <LoadingState variant="centered" className="py-16" />}

        {!loadingAccounts && !loadingConnections && !showWizard && sourcePaused && accounts.length > 0 && (
          <div className="border border-border bg-surface rounded-lg p-4 mb-6 flex items-start gap-2.5" aria-live="polite">
            <AlertTriangle size={16} strokeWidth={1.5} className="text-muted-foreground shrink-0 mt-0.5" />
            <div>
              <p className="text-sm font-medium">Fuente pausada por un administrador</p>
              <p className="text-xs text-muted-foreground mt-0.5">
                CloudValley desactivó temporalmente la sincronización con Google Sheets para tu startup. Tus cuentas
                y mapeos se conservan tal cual quedaron; pedile a un administrador que la reactive para poder
                sincronizar de nuevo.
              </p>
            </div>
          </div>
        )}

        {!loadingAccounts && !loadingConnections && !showWizard && accounts.length === 0 && sourcePaused && (
          <EmptyState
            icon={FileSpreadsheet}
            title="Google Sheets está pausado para tu startup"
            description="Un administrador de CloudValley tiene que habilitar esta fuente antes de que puedas conectar una cuenta. Pedile que la active."
          />
        )}

        {!loadingAccounts && !loadingConnections && !showWizard && accounts.length === 0 && !sourcePaused && (
          <EmptyState
            icon={FileSpreadsheet}
            title="Todavía no conectaste ninguna cuenta de Google"
            description="Conectá una cuenta, elegís una planilla, mapeás sus columnas a tus métricas, y a partir de ahí se sincroniza sola una vez por día (o cuando quieras, a mano). Podés conectar más de una cuenta y más de una hoja si tus datos están repartidos."
            action={{ label: connecting ? "Conectando…" : "Conectar cuenta de Google", onClick: handleConnect }}
          />
        )}

        {!loadingAccounts && !loadingConnections && !showWizard && accounts.length > 0 && (
          <div className="space-y-4">
            {accounts.map((account) => {
              const accountConnections = connectionsByAccount.get(account.account_id) ?? [];
              const needsReconnect = !sourcePaused && account.reconnect_required;
              return (
                <SectionCard
                  key={account.account_id}
                  title={account.google_account_email}
                  action={
                    <div className="flex items-center gap-1.5">
                      {sourcePaused ? (
                        <Badge variant="secondary">
                          <AlertTriangle size={11} className="mr-1" /> Pausada
                        </Badge>
                      ) : needsReconnect ? (
                        <Button size="sm" onClick={handleConnect} disabled={connecting}>
                          <AlertTriangle size={12} className="mr-1.5" />
                          {connecting ? "Conectando…" : "Reconectar"}
                        </Button>
                      ) : (
                        <Badge variant="success">
                          <CheckCircle2 size={11} className="mr-1" /> Conectada
                        </Badge>
                      )}
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setConfirmDisconnectAccount(account)}
                        disabled={disconnectingAccountId === account.account_id}
                      >
                        <Unlink size={12} className="mr-1.5" /> Desconectar
                      </Button>
                    </div>
                  }
                >
                  {needsReconnect && (
                    <p className="text-xs text-muted-foreground mb-3">
                      Se perdió el acceso a esta cuenta. Reconectá para seguir sincronizando sus hojas.
                    </p>
                  )}
                  {accountConnections.length === 0 ? (
                    <p className="text-sm text-muted-foreground text-center py-4 border border-dashed border-border rounded-md">
                      Todavía no mapeaste ninguna hoja de esta cuenta.
                    </p>
                  ) : (
                    <div className="space-y-2">
                      {accountConnections.map((conn) => {
                        const syncState = syncResults[conn.connection_id];
                        const missing = missingHeadersByConnection[conn.connection_id];
                        const busy = syncBusyConnectionId === conn.connection_id;
                        return (
                          <div key={conn.connection_id} className="border border-border rounded-md p-3">
                            <div className="flex items-start justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium flex items-center gap-1.5 min-w-0">
                                  <FileSpreadsheet size={13} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                                  <span className="truncate">
                                    {conn.spreadsheet_name} · {conn.sheet_name}
                                  </span>
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {conn.metrics.length} métrica{conn.metrics.length === 1 ? "" : "s"} · última
                                  sincronización {timeAgo(conn.last_synced_at)}
                                  {conn.last_sync_status && (
                                    <>
                                      {" · "}
                                      <span className={conn.last_sync_status === "success" ? "" : "text-destructive"}>
                                        {conn.last_sync_status}
                                      </span>
                                    </>
                                  )}
                                </p>
                              </div>
                              <div className="flex items-center gap-1 shrink-0">
                                <Button
                                  variant="outline"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => runConnectionSync(conn.connection_id, false)}
                                  disabled={busy || sourcePaused || needsReconnect}
                                >
                                  <RefreshCw size={11} className={cn("mr-1", busy && "animate-spin")} />
                                  Sincronizar
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => openEditConnection(conn)}
                                  disabled={sourcePaused || needsReconnect}
                                >
                                  Editar
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="icon"
                                  className="h-7 w-7"
                                  onClick={() => setConfirmRemoveConnection(conn)}
                                  aria-label={`Quitar ${conn.spreadsheet_name} · ${conn.sheet_name}`}
                                >
                                  <Trash2 size={12} strokeWidth={1.5} />
                                </Button>
                              </div>
                            </div>

                            {missing && missing.length > 0 && (
                              <div className="border border-destructive/40 bg-destructive/5 rounded-md p-2.5 mt-2.5 text-xs">
                                <p className="font-medium text-destructive">La planilla cambió de estructura</p>
                                <p className="text-muted-foreground mt-0.5">
                                  Estas columnas ya no existen: {missing.join(", ")}.
                                </p>
                                <Button size="sm" className="mt-2 h-7 text-xs" onClick={() => openEditConnection(conn)}>
                                  Editar mapeo
                                </Button>
                              </div>
                            )}

                            {syncState &&
                              (() => {
                                const { result, wasDryRun } = syncState;
                                const failed =
                                  result.status === "error" || (result.rows_processed === 0 && result.rows_rejected > 0);
                                const grouped = groupRowErrors(result.row_errors);
                                return (
                                  <div
                                    className={cn(
                                      "rounded-md p-2.5 mt-2.5 text-xs border",
                                      failed
                                        ? "border-destructive/40 bg-destructive/5"
                                        : result.rows_rejected > 0
                                          ? "border-warning/40 bg-warning/10"
                                          : "border-success/40 bg-success/10"
                                    )}
                                    aria-live="polite"
                                  >
                                    <p className="font-medium">
                                      {wasDryRun
                                        ? "Resultado de la prueba (no se guardó nada)"
                                        : failed
                                          ? "No se pudo sincronizar nada"
                                          : "Última sincronización"}
                                    </p>
                                    <p className="text-muted-foreground mt-0.5">
                                      {result.rows_processed} fila{result.rows_processed === 1 ? "" : "s"} procesada
                                      {result.rows_processed === 1 ? "" : "s"}
                                      {result.rows_rejected > 0 &&
                                        ` · ${result.rows_rejected} rechazada${result.rows_rejected === 1 ? "" : "s"}`}
                                    </p>
                                    {grouped.length > 0 && (
                                      <ul className="mt-1.5 space-y-1">
                                        {grouped.map((g, i) => (
                                          <li key={i} className="text-destructive">
                                            <span className="font-medium">{g.field}</span>: {g.reason}
                                            {g.count > 1 && (
                                              <span className="text-muted-foreground"> (afecta {g.count} filas)</span>
                                            )}
                                          </li>
                                        ))}
                                      </ul>
                                    )}
                                  </div>
                                );
                              })()}
                          </div>
                        );
                      })}
                    </div>
                  )}
                  {!sourcePaused && !needsReconnect && (
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-3"
                      onClick={() => openAddConnection(account.account_id)}
                    >
                      <Plus size={12} className="mr-1.5" /> Agregar hoja
                    </Button>
                  )}
                </SectionCard>
              );
            })}
          </div>
        )}

        {showWizard && (
          <div className="space-y-6">
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <span className="truncate">{wizardAccount?.google_account_email}</span>
              <ChevronRight size={12} strokeWidth={1.5} className="shrink-0" />
              <span className={cn(step === 1 && "text-foreground font-medium")}>1. Planilla</span>
              <ChevronRight size={12} strokeWidth={1.5} />
              <span className={cn(step === 2 && "text-foreground font-medium")}>2. Hoja</span>
              <ChevronRight size={12} strokeWidth={1.5} />
              <span className={cn(step === 3 && "text-foreground font-medium")}>3. Mapear columnas</span>
            </div>

            {loadingEditConnection && <LoadingState variant="centered" className="py-16" />}

            {!loadingEditConnection && step === 1 && (() => {
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
                      title="No encontramos planillas en esta cuenta de Google."
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
                                setHeaders([]);
                                setPeriodColumn(null);
                                setMetricConfigs([]);
                                setStaleHeaders([]);
                                setStep(2);
                                if (wizardAccountId) loadTabs(wizardAccountId, s.spreadsheet_id);
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

            {!loadingEditConnection && step === 2 && (() => {
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
                                if (wizardAccountId && selectedSpreadsheetId) loadHeaders(wizardAccountId, selectedSpreadsheetId, t);
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

            {!loadingEditConnection && step === 3 && (
              <SectionCard
                title="Mapeá las columnas"
                description={
                  headers.length > 0
                    ? `${selectedSpreadsheetName} · ${selectedSheetName} · ${usedHeaderSet.size} de ${headers.length} columnas usadas`
                    : `${selectedSpreadsheetName} · ${selectedSheetName}`
                }
              >
                {!loadingHeaders && headers.length > 0 && (
                  <p className="text-xs text-muted-foreground mb-3">
                    Elegí qué columna marca el período y qué métricas se arman a partir de las demás columnas. Si tu
                    planilla tiene varias filas por mes (por transacción), elegí cómo combinarlas: sumar, contar
                    filas, contar valores únicos, promediar o quedarte con el último valor.
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
                {duplicateInputKeys.length > 0 && (
                  <div className="border border-destructive/40 bg-destructive/5 rounded-md p-3 mb-4 text-xs" aria-live="polite">
                    <p className="font-medium text-destructive">Hay métricas repetidas: {duplicateInputKeys.join(", ")}</p>
                    <p className="text-muted-foreground mt-0.5">Cada métrica solo puede configurarse una vez.</p>
                  </div>
                )}
                {loadingHeaders ? (
                  <LoadingState />
                ) : headers.length === 0 ? (
                  <EmptyState bordered={false} icon={FileSpreadsheet} title="Esta hoja no tiene columnas en la primera fila." />
                ) : (
                  <div className="space-y-5">
                    <div>
                      <label className="text-xs font-medium block mb-1.5">Columna de período (mes)</label>
                      <div className="max-w-xs">
                        <HeaderCombobox
                          headers={headers}
                          value={periodColumn}
                          onChange={setPeriodColumn}
                          placeholder="Elegí una columna…"
                          ariaLabel="Columna de período"
                        />
                      </div>
                    </div>

                    <div>
                      <div className="flex items-center justify-between mb-1.5">
                        <label className="text-xs font-medium">Métricas</label>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() =>
                            setMetricConfigs((prev) => [
                              ...prev,
                              { _id: crypto.randomUUID(), input_key: "", aggregation: "", filters: [] },
                            ])
                          }
                        >
                          <Plus size={12} className="mr-1.5" /> Agregar métrica
                        </Button>
                      </div>
                      {metricConfigs.length === 0 ? (
                        <p className="text-sm text-muted-foreground text-center py-6 border border-dashed border-border rounded-md">
                          Todavía no agregaste ninguna métrica.
                        </p>
                      ) : (
                        <div className="space-y-3">
                          {metricConfigs.map((config) => (
                            <MetricConfigCard
                              key={config._id}
                              config={config}
                              headers={headers}
                              inputDefs={inputDefs}
                              usedInputKeys={
                                new Set(
                                  metricConfigs
                                    .filter((m) => m._id !== config._id)
                                    .map((m) => m.input_key)
                                    .filter(Boolean)
                                )
                              }
                              requiredByInputKey={requiredByInputKey}
                              onChange={(next) =>
                                setMetricConfigs((prev) => prev.map((m) => (m._id === config._id ? next : m)))
                              }
                              onRemove={() => setMetricConfigs((prev) => prev.filter((m) => m._id !== config._id))}
                            />
                          ))}
                        </div>
                      )}
                    </div>
                  </div>
                )}
                {!loadingHeaders && headers.length > 0 && (
                  <p className="text-xs text-muted-foreground pt-3">
                    {!periodColumn
                      ? "Falta elegir la columna de período (mes)."
                      : metricConfigs.length === 0
                        ? "Agregá al menos una métrica."
                        : !allConfigsValid
                          ? "Hay métricas incompletas: revisá que cada una tenga cómo combinar filas y su columna."
                          : duplicateInputKeys.length > 0
                            ? "Hay métricas repetidas: dejá cada una una sola vez."
                            : "Listo para guardar."}
                  </p>
                )}
                <FormActions
                  className="mt-4"
                  onCancel={() => setStep(2)}
                  cancelLabel="Atrás"
                  onSubmit={handleSaveMapping}
                  submitLabel="Guardar mapeo"
                  busy={savingMapping}
                  disabled={headers.length === 0 || !canSaveMapping}
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

        {!showWizard && !loadingAccounts && !loadingConnections && accounts.length > 0 && (
          <div className="mt-6">
            <h3 className="text-xs font-medium text-foreground uppercase tracking-wide mb-3">Historial de cargas</h3>
            {financial.loadingLogs ? (
              <LoadingState />
            ) : (
              <ImportLogTable logs={financial.logs} emptyLabel="Todavía no se sincronizó ningún dato." />
            )}
          </div>
        )}
      </div>

      <ConfirmationDialog
        open={!!confirmDisconnectAccount}
        onOpenChange={(o) => !o && setConfirmDisconnectAccount(null)}
        title="Desconectar cuenta de Google"
        description={
          confirmDisconnectAccount
            ? `Se revoca el acceso de CloudValley a ${confirmDisconnectAccount.google_account_email} y se corta la sincronización automática de sus hojas mapeadas (no se borran: si reconectás esta misma cuenta después, siguen desde donde quedaron). No afecta a otras cuentas conectadas.`
            : ""
        }
        confirmLabel="Desconectar"
        variant="destructive"
        busy={!!disconnectingAccountId}
        onConfirm={handleDisconnectAccount}
      />

      <ConfirmationDialog
        open={!!confirmRemoveConnection}
        onOpenChange={(o) => !o && setConfirmRemoveConnection(null)}
        title="Quitar hoja conectada"
        description={
          confirmRemoveConnection
            ? `Se deja de sincronizar "${confirmRemoveConnection.spreadsheet_name} · ${confirmRemoveConnection.sheet_name}". Sus métricas mapeadas (${confirmRemoveConnection.metrics.length}) vuelven a estar disponibles para cargar a mano o mapear en otra hoja. No afecta la cuenta de Google ni tus otras conexiones.`
            : ""
        }
        confirmLabel="Quitar hoja"
        variant="destructive"
        busy={!!removingConnectionId}
        onConfirm={handleRemoveConnection}
      />
    </AppLayout>
  );
}

// Searchable combobox over the sheet's headers — same Popover+Command pattern
// as FormulaField's variable picker. Reused for period_column, value_column,
// distinct_column and every filter's column, so there's one place that knows
// how to pick "a column from this sheet."
function HeaderCombobox({
  headers,
  value,
  onChange,
  placeholder,
  ariaLabel,
}: {
  headers: string[];
  value: string | null;
  onChange: (v: string) => void;
  placeholder: string;
  ariaLabel: string;
}) {
  const [open, setOpen] = useState(false);
  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 w-full justify-between font-normal" aria-label={ariaLabel}>
          <span className="truncate font-mono text-xs">{value ?? placeholder}</span>
          <ChevronsUpDown size={12} className="opacity-50 shrink-0" />
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-64 p-0" align="start">
        <Command>
          <CommandInput placeholder="Buscar columna…" />
          <CommandList>
            <CommandEmpty>Sin resultados.</CommandEmpty>
            <CommandGroup>
              {headers.map((h) => (
                <CommandItem
                  key={h}
                  value={h}
                  onSelect={() => {
                    onChange(h);
                    setOpen(false);
                  }}
                >
                  {h}
                </CommandItem>
              ))}
            </CommandGroup>
          </CommandList>
        </Command>
      </PopoverContent>
    </Popover>
  );
}

// One metric's config: which raw metric it feeds, how to combine rows that
// share a period (sum/count/count_distinct/last/average), which column(s)
// that needs, and which rows count at all (filters). A single sheet column
// can be the value_column for several of these cards with different filters
// (e.g. "Monto" → new_mrr filtered Evento=New, → churned_mrr filtered
// Evento=Churn) — that's why config is keyed per metric, not per column.
function MetricConfigCard({
  config,
  headers,
  inputDefs,
  usedInputKeys,
  requiredByInputKey,
  onChange,
  onRemove,
}: {
  config: DraftMetricConfig;
  headers: string[];
  inputDefs: MetricDef[];
  usedInputKeys: Set<string>;
  requiredByInputKey: Record<string, string[]>;
  onChange: (next: DraftMetricConfig) => void;
  onRemove: () => void;
}) {
  const [metricPickerOpen, setMetricPickerOpen] = useState(false);
  const needsValueColumn = config.aggregation === "sum" || config.aggregation === "last" || config.aggregation === "average";
  const needsDistinctColumn = config.aggregation === "count_distinct";
  const selectedDef = inputDefs.find((d) => d.input_key === config.input_key);
  const requiredIn = config.input_key ? requiredByInputKey[config.input_key] : undefined;

  const addFilter = () =>
    onChange({ ...config, filters: [...config.filters, { column: headers[0] ?? "", values: [] }] });
  const updateFilter = (i: number, next: MetricFilter) =>
    onChange({ ...config, filters: config.filters.map((f, idx) => (idx === i ? next : f)) });
  const removeFilter = (i: number) => onChange({ ...config, filters: config.filters.filter((_, idx) => idx !== i) });

  return (
    <div className="border border-border rounded-md p-3 space-y-3">
      <div className="flex items-start justify-between gap-2">
        <div className="flex-1 min-w-0 grid grid-cols-1 sm:grid-cols-2 gap-2">
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Métrica</label>
            <Popover open={metricPickerOpen} onOpenChange={setMetricPickerOpen}>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-9 w-full justify-between font-normal"
                  aria-label="Elegir métrica"
                >
                  <span className="truncate">{selectedDef?.name ?? "Elegir métrica…"}</span>
                  <ChevronsUpDown size={12} className="opacity-50 shrink-0" />
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-72 p-0" align="start">
                <Command>
                  <CommandInput placeholder="Buscar métrica…" />
                  <CommandList>
                    <CommandEmpty>Sin resultados.</CommandEmpty>
                    <CommandGroup>
                      {inputDefs
                        .filter((d) => !usedInputKeys.has(d.input_key!) || d.input_key === config.input_key)
                        .map((d) => {
                          const reqIn = requiredByInputKey[d.input_key!];
                          return (
                            <CommandItem
                              key={d.input_key}
                              value={`${d.name} ${d.input_key}`}
                              onSelect={() => {
                                onChange({ ...config, input_key: d.input_key! });
                                setMetricPickerOpen(false);
                              }}
                              className="flex items-center justify-between gap-3"
                            >
                              <span className="min-w-0">
                                <span className="block truncate">{d.name}</span>
                                {reqIn && (
                                  <span className="block text-[10px] text-tertiary truncate">
                                    Usada en {reqIn.join(", ")}
                                  </span>
                                )}
                              </span>
                              <span className="text-[10px] font-mono text-tertiary shrink-0">{d.input_key}</span>
                            </CommandItem>
                          );
                        })}
                    </CommandGroup>
                  </CommandList>
                </Command>
              </PopoverContent>
            </Popover>
          </div>
          <div>
            <label className="text-[11px] text-muted-foreground block mb-1">Cómo combinar filas</label>
            <Select
              value={config.aggregation}
              onValueChange={(v) =>
                onChange({ ...config, aggregation: v as Aggregation, value_column: undefined, distinct_column: undefined })
              }
            >
              <SelectTrigger className="h-9">
                <SelectValue placeholder="Elegir…" />
              </SelectTrigger>
              <SelectContent>
                {(Object.keys(AGGREGATION_LABELS) as Aggregation[]).map((a) => (
                  <SelectItem key={a} value={a}>
                    {AGGREGATION_LABELS[a]}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="shrink-0 h-9 w-9"
          onClick={onRemove}
          aria-label={`Quitar ${selectedDef?.name ?? "métrica"}`}
        >
          <Trash2 size={14} strokeWidth={1.5} />
        </Button>
      </div>

      {(needsValueColumn || needsDistinctColumn) && (
        <div>
          <label className="text-[11px] text-muted-foreground block mb-1">
            {needsDistinctColumn ? "Columna a contar valores únicos" : "Columna con el valor"}
          </label>
          <div className="max-w-xs">
            <HeaderCombobox
              headers={headers}
              value={needsDistinctColumn ? (config.distinct_column ?? null) : (config.value_column ?? null)}
              onChange={(v) =>
                onChange(needsDistinctColumn ? { ...config, distinct_column: v } : { ...config, value_column: v })
              }
              placeholder="Elegí una columna…"
              ariaLabel={needsDistinctColumn ? "Columna de valores únicos" : "Columna de valor"}
            />
          </div>
        </div>
      )}

      <div>
        <div className="flex items-center justify-between">
          <label className="text-[11px] text-muted-foreground">Filtros: solo contar filas que cumplan</label>
          <Button variant="ghost" size="sm" className="h-6 px-2 text-xs" onClick={addFilter}>
            <Plus size={11} className="mr-1" /> Agregar filtro
          </Button>
        </div>
        {config.filters.length > 0 && (
          <div className="space-y-2 mt-1.5">
            {config.filters.map((f, i) => (
              <FilterRow
                key={i}
                filter={f}
                headers={headers}
                onChange={(next) => updateFilter(i, next)}
                onRemove={() => removeFilter(i)}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// A filter row: which column gates the rows, and which values of that column
// count (OR within this list — several filter rows on the same metric AND
// together). Values are entered as free-text tags since sheet cell values
// aren't known ahead of time (no API to list distinct values).
function FilterRow({
  filter,
  headers,
  onChange,
  onRemove,
}: {
  filter: MetricFilter;
  headers: string[];
  onChange: (next: MetricFilter) => void;
  onRemove: () => void;
}) {
  const [draft, setDraft] = useState("");

  const addValue = () => {
    const v = draft.trim();
    if (!v || filter.values.includes(v)) {
      setDraft("");
      return;
    }
    onChange({ ...filter, values: [...filter.values, v] });
    setDraft("");
  };
  const removeValue = (v: string) => onChange({ ...filter, values: filter.values.filter((x) => x !== v) });

  return (
    <div className="flex items-start gap-2 bg-surface rounded-md p-2">
      <div className="w-36 shrink-0">
        <HeaderCombobox
          headers={headers}
          value={filter.column || null}
          onChange={(v) => onChange({ ...filter, column: v })}
          placeholder="Columna…"
          ariaLabel="Columna del filtro"
        />
      </div>
      <div className="flex-1 min-w-0">
        {filter.values.length > 0 && (
          <div className="flex flex-wrap gap-1 mb-1">
            {filter.values.map((v) => (
              <Badge key={v} variant="secondary" className="gap-1">
                {v}
                <button
                  type="button"
                  onClick={() => removeValue(v)}
                  aria-label={`Quitar valor ${v}`}
                  className="hover:text-destructive"
                >
                  <X size={10} />
                </button>
              </Badge>
            ))}
          </div>
        )}
        <Input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" || e.key === ",") {
              e.preventDefault();
              addValue();
            }
          }}
          onBlur={addValue}
          placeholder="Valor y Enter…"
          aria-label="Agregar valor al filtro"
          className="h-8 text-xs"
        />
      </div>
      <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={onRemove} aria-label="Quitar filtro">
        <X size={12} />
      </Button>
    </div>
  );
}
