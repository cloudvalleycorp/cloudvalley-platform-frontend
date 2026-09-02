import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { toast } from "sonner";
import {
  FileSpreadsheet,
  Unlink,
  RefreshCw,
  AlertTriangle,
  CheckCircle2,
  Check,
  ChevronRight,
  ChevronsUpDown,
  Plus,
  Trash2,
  Upload,
  Sparkles,
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
import { Checkbox } from "@/components/ui/checkbox";
import { Popover, PopoverTrigger, PopoverContent } from "@/components/ui/popover";
import { Command, CommandInput, CommandList, CommandEmpty, CommandGroup, CommandItem } from "@/components/ui/command";
import { Select, SelectTrigger, SelectValue, SelectContent, SelectItem } from "@/components/ui/select";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialMetrics } from "@/hooks/useFinancialMetrics";
import { useMetricInsights } from "@/hooks/useMetricInsights";
import { handleMembershipError } from "@/lib/membership";
import { periodRange } from "@/lib/metricPeriod";
import { groupRowErrors } from "@/lib/financialData";
import { findMetricsUsingField } from "@/lib/metricLineage";
import type { MetricDef } from "@/lib/metrics";
import { cn } from "@/lib/utils";
import type { SuggestedMetric, MetricNeedingMoreData } from "@/lib/aiInsights";
import { SuggestedMetricsReview } from "@/components/metrics/SuggestedMetricsReview";
import { EntityResolutionDialog } from "@/components/metrics/EntityResolutionDialog";
import { EntityAliasesDialog } from "@/components/metrics/EntityAliasesDialog";
import { DuplicateTransactionsDialog } from "@/components/metrics/DuplicateTransactionsDialog";
import { GridLayoutMapping } from "@/components/metrics/GridLayoutMapping";
import { EavLayoutMapping } from "@/components/metrics/EavLayoutMapping";
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
  REQUEST_WORKBOOK_UPLOAD_URL,
  CONFIRM_WORKBOOK_UPLOAD_URL,
  GET_UPLOAD_STATUS_URL,
  DELETE_WORKBOOK_UPLOAD_URL,
  CLASSIFY_WORKBOOK_URL,
  SET_CONNECTION_DATA_ROLE_URL,
  SET_CONNECTION_SYNC_SETTINGS_URL,
  EXTRACT_SHEET_LAYOUT_URL,
  GET_WORKBOOK_DOWNLOAD_URL,
  EXCEL_CONTENT_TYPE,
  parseSheetsError,
  fieldCountLabel,
  type GoogleAccount,
  type GoogleAccountsResponse,
  type SheetSummary,
  type FieldMapping,
  type SheetConnection,
  type SyncResult,
  type WorkbookSheetPreview,
  type ClassifiedSheet,
  type DataRole,
  type SyncMode,
  type SyncFrequency,
  type SheetLayout,
  type ExtractSheetLayoutRequest,
  type ExtractSheetLayoutResponse,
  type PeriodAxisEntry,
  type ConceptAxisEntry,
  type EavMetricMapping,
  type SaveSheetMappingRequest,
  type GetWorkbookDownloadUrlResponse,
} from "@/lib/sheetsIntegration";

const PERIOD_PATTERNS = ["periodo", "period", "mes", "month", "fecha", "date"];

// 1 Planilla/Archivo → 2 Hoja (solo Sheets) → 3 Reconociendo (resultado de
// classify-workbook, pantalla propia) → 4 Mapear columnas → 5 Confirmar
// métricas (solo si analyze-transactional-sheet sugirió algo).
type WizardStep = 1 | 2 | 3 | 4 | 5;

// Excel no tiene paso "Hoja" propio (WizardStep 2 no se usa en ese modo) —
// este mapa traduce el WizardStep real al índice visual del rail de abajo.
const EXCEL_STEP_LABELS = ["Archivo", "Reconociendo", "Mapear columnas", "Confirmar métricas"];
const EXCEL_STEP_INDEX: Record<WizardStep, number> = { 1: 1, 2: 1, 3: 2, 4: 3, 5: 4 };
const SHEETS_STEP_LABELS = ["Planilla", "Hoja", "Reconociendo", "Mapear columnas", "Confirmar métricas"];

// Un campo crudo en edición: cada columna de la hoja se usa (con un
// field_key propio y un tipo) o no se usa — nada de agregación ni filtros
// acá, eso vive en las fórmulas de Métricas (ver formulaEngine.ts:
// FIELDSUM/FIELDCOUNT/FIELDCOUNTD/FIELDAVG). La integración solo dice "qué
// columna se lee y cómo se llama."
export type DraftFieldMapping = {
  column: string;
  field_key: string;
  value_type: "number" | "text";
  // "" = todavía sin descripción (columna nueva, o mapeo viejo de antes de
  // este campo, 2026-08-11) — el backend la genera con IA al guardar si se
  // manda vacía/ausente. Si ya tiene contenido y se guarda así, el backend
  // NUNCA la sobrescribe (ni parcial ni totalmente), la respete el usuario
  // o no la haya tocado. originalDescription es lo que vino sembrado desde
  // el mapeo guardado (o "" si es nueva) — compararla contra description
  // es cómo FieldMappingRow decide si mostrar "Editado" o "Generada".
  description: string;
  originalDescription: string;
};

const DIACRITICS_RE = new RegExp("[\\u0300-\\u036f]", "g");
function normalizeForMatch(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(/[^a-z0-9]+/g, "");
}

// Igual que normalizeForMatch pero conserva separadores como "_" (snake_case
// legible: "Cliente ID" → "cliente_id") — para sugerir un field_key, no para
// comparar coincidencias.
function slugifyFieldKey(s: string): string {
  const slug = s
    .trim()
    .toLowerCase()
    .normalize("NFD")
    .replace(DIACRITICS_RE, "")
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");
  return slug || "campo";
}

// Primer pase para que el usuario revise/ajuste en vez de nombrar cada
// columna desde cero: detecta la columna de período por nombre, y sugiere un
// field_key (snake_case) para cada columna restante — todas number por
// default (no hay forma confiable de adivinar texto vs. número solo por el
// nombre de la columna, el usuario lo corrige si hace falta).
// Chequeo determinístico, no-IA: la columna de período tiene que contener
// valores que parezcan fecha (Date.parse es permisivo — "Enero 2026",
// "2026-01", "01/2026" todos parsean; "Venta bruta" no). Sin esto, elegir a
// mano una columna de texto como período se guardaba en silencio sin ningún
// aviso — justo el caso de un estado de resultados con la columna de
// etiquetas de fila marcada por error como "período".
// Contrato 2026-09-01: extract-sheet-layout garantiza "number"|"text" en
// value_type (el backend normaliza cualquier otra cosa que la IA devuelva
// antes de responder). Antes de este contrato se vieron en vivo "monetary"
// y "currency" en corridas reales sobre el mismo archivo — ninguno aceptado
// por save-sheet-mapping (400 "grid inválido"). Esta función queda como red
// de seguridad, no como el camino esperado: si backend rompe la garantía de
// nuevo, un valor de plata cae a "number" (más útil que "text" para algo que
// se va a sumar) y cualquier otra cosa desconocida cae a "text".
export function normalizeConceptValueType(raw: string): "number" | "text" {
  if (raw === "number" || raw === "text") return raw;
  if (raw === "monetary" || raw === "currency") return "number";
  return "text";
}

// Causa real del loop "la hoja cambió" en layout grid/eav, confirmada en
// vivo 2026-09-01 con un archivo de control sin filas vacías (guardó al
// primer intento) contra el mismo archivo con una fila 100% vacía en todos
// los períodos (ej. "Otros ingresos" en cero/blanco los 12 meses): la IA de
// extract-sheet-layout es no-determinística sobre si una fila así cuenta
// como concepto. Dos extracciones seguidas del mismo archivo sin cambios
// pueden traer listas de distinto largo, y save-sheet-mapping lo interpreta
// como "el archivo cambió". Como esa fila no tiene ningún dato real que
// perder, la solución no es explicarle al founder que edite el Excel y
// vuelva a subirlo — es detectar automáticamente cuál fila es la
// inconsistente (comparando qué se mandó a guardar contra la reextracción
// fresca) y excluirla del mapeo para poder guardar el resto ya mismo. Ver
// el uso en doSaveMapping.
export function findMissingOrNewConcepts(submitted: string[], fresh: string[]): string[] {
  const submittedSet = new Set(submitted);
  const freshSet = new Set(fresh);
  const diff = new Set<string>();
  for (const label of submitted) if (!freshSet.has(label)) diff.add(label);
  for (const label of fresh) if (!submittedSet.has(label)) diff.add(label);
  return Array.from(diff);
}

// Tope de reintentos automáticos del loop de arriba — puramente una
// salvaguarda contra un caso patológico (varias filas inestables a la vez),
// no el camino esperado: en la práctica un archivo real con una sola fila
// vacía se resuelve en 1-2 reintentos.
const MAX_LAYOUT_STALE_ATTEMPTS = 3;

// Bug real encontrado en vivo 2026-09-01: fieldMappings está indexado por
// NOMBRE de columna (Record<string, DraftFieldMapping>), no por posición —
// con headers repetidos (ej. "Cliente" dos veces), ambas columnas colisionan
// en la misma entrada y una se pierde en silencio al guardar (confirmado:
// el field_mappings mandado a save-sheet-mapping solo traía 1 "Cliente" y 1
// "Monto" en vez de 2 de cada uno, y el ingest_result terminó usando los
// valores de la SEGUNDA columna física, descartando la primera sin ningún
// aviso). Arreglar el modelo de datos para indexar por posición es un
// cambio de arquitectura más grande — mientras tanto, esto se detecta y
// BLOQUEA el guardado (a diferencia de los demás avisos de este wizard, que
// nunca bloquean): acá no hay ambigüedad de negocio que el founder pueda
// resolver desde la UI, es pérdida de datos garantizada.
export function findDuplicateHeaders(headers: string[]): string[] {
  const counts = new Map<string, number>();
  for (const h of headers) counts.set(h, (counts.get(h) ?? 0) + 1);
  return Array.from(counts.entries())
    .filter(([, c]) => c > 1)
    .map(([h]) => h);
}

export function periodColumnLooksWrong(header: string | null, headers: string[], sampleRows: string[][]): boolean {
  if (!header) return false;
  const idx = headers.indexOf(header);
  if (idx === -1) return false;
  const values = sampleRows.map((r) => r[idx]).filter((v) => v != null && String(v).trim() !== "");
  if (values.length === 0) return false;
  const parseable = values.filter((v) => !Number.isNaN(Date.parse(String(v)))).length;
  return parseable / values.length < 0.5;
}

export function autoMapHeaders(headers: string[]): { periodColumn: string | null; fieldMappings: Record<string, DraftFieldMapping> } {
  let periodColumn: string | null = null;
  const fieldMappings: Record<string, DraftFieldMapping> = {};
  const usedKeys = new Set<string>();
  for (const header of headers) {
    const norm = normalizeForMatch(header);
    if (!periodColumn && PERIOD_PATTERNS.includes(norm)) {
      periodColumn = header;
      continue;
    }
    const base = slugifyFieldKey(header);
    let key = base;
    let suffix = 2;
    while (usedKeys.has(key)) {
      key = `${base}_${suffix}`;
      suffix++;
    }
    usedKeys.add(key);
    fieldMappings[header] = { column: header, field_key: key, value_type: "number", description: "", originalDescription: "" };
  }
  return { periodColumn, fieldMappings };
}

const DATA_ROLE_LABELS: Record<DataRole, string> = {
  source_of_truth: "Fuente de verdad",
  operational_input: "Input operativo",
  financial_model: "Modelo financiero",
  historical_snapshot: "Snapshot histórico",
  report_export: "Exportación de reporte",
};

const SYNC_MODE_LABELS: Record<SyncMode, string> = {
  live: "En vivo",
  scheduled: "Programado",
  event_based: "Por evento",
  manual: "Manual",
  snapshot: "Snapshot",
};

const SYNC_FREQUENCY_LABELS: Record<SyncFrequency, string> = {
  every_15_min: "Cada 15 min",
  hourly: "Cada hora",
  every_6_hours: "Cada 6 horas",
  daily: "Diario",
  weekly: "Semanal",
  monthly: "Mensual",
  manual: "Manual",
};

const SPREADSHEET_TYPE_LABELS: Record<string, string> = {
  time_series: "Serie temporal",
  transaction_ledger: "Libro de transacciones",
  entity_table: "Tabla de entidades",
  financial_model: "Modelo financiero",
  historical_snapshot: "Snapshot histórico",
  report_export: "Exportación de reporte",
};

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
  // Esta pantalla solo usa financial.logs/reloadLogs (import log de Sheets),
  // nunca entries — un rango chico alcanza, no hace falta el histórico.
  const financialRange = useMemo(() => {
    const now = new Date();
    return periodRange({ month: now.getMonth() + 1, year: now.getFullYear() }, 1);
  }, []);
  const financial = useFinancialMetrics(company_id, financialRange);
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
  // Confirmación previa cuando editar un mapeo desmapea o retipa un campo
  // que 1+ métricas calculadas ya usan — sin esto se rompían en silencio.
  const [pendingBreakingChange, setPendingBreakingChange] = useState<MetricDef[] | null>(null);
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
  // Vista previa de datos reales: get-sheet-headers/confirm-workbook-upload
  // ya devuelven sample_rows y hasta esta pasada nunca se mostraban en
  // ningún lado (solo se usaban para auto-mapear). Mostrarlas ayuda a
  // confirmar "así se ve tu data" antes de mapear, en vez de confiar a
  // ciegas en nombres de columna.
  const [sampleRows, setSampleRows] = useState<string[][]>([]);
  const [loadingHeaders, setLoadingHeaders] = useState(false);
  const [periodColumn, setPeriodColumn] = useState<string | null>(null);
  // Keyed por columna — cada columna de la hoja se usa (con su field_key +
  // tipo) o no aparece acá. Reemplaza el viejo metricConfigs (agregación +
  // filtros por métrica), que ya no existe: eso vive en las fórmulas de
  // Métricas ahora.
  const [fieldMappings, setFieldMappings] = useState<Record<string, DraftFieldMapping>>({});
  const [staleHeaders, setStaleHeaders] = useState<string[]>([]);
  // save-sheet-mapping, 400: field_key ya usado por OTRA conexión activa —
  // solo se sabe después de intentar guardar (a diferencia de
  // duplicateFieldKeys de abajo, que es local a este mapeo). Se limpia solo
  // en cuanto el usuario toca el mapeo de nuevo, ver el useEffect más abajo.
  const [crossConnectionDuplicateKeys, setCrossConnectionDuplicateKeys] = useState<string[]>([]);
  useEffect(() => {
    setCrossConnectionDuplicateKeys([]);
  }, [fieldMappings]);
  const [savingMapping, setSavingMapping] = useState(false);
  const [loadingEditConnection, setLoadingEditConnection] = useState(false);

  // ✨ Analizar con IA: alternativa al mapeo columna-por-columna de abajo, no
  // lo reemplaza. Los campos sugeridos se aplican directo sobre
  // fieldMappings (mismo estado que ya edita FieldMappingRow) — la revisión
  // es la lista de checkboxes que ya existe, no hace falta una pantalla
  // nueva para eso. Las métricas sugeridas sí son un concepto nuevo (crean
  // una métrica calculada entera, no solo un campo crudo) y usan
  // SuggestedMetricsReview para aprobar/editar antes de guardar.
  const { analyzeTransactionalSheet, analyzingSheet } = useMetricInsights(company_id);
  const [suggestedMetrics, setSuggestedMetrics] = useState<SuggestedMetric[]>([]);
  const [metricsNeedingMoreData, setMetricsNeedingMoreData] = useState<MetricNeedingMoreData[]>([]);
  // analyzeTransactionalSheet ya avisa con un toast si falla (useMetricInsights.ts),
  // pero un toast es efímero (~4s) y el usuario recién ve el paso de mapeo
  // después de esa espera — encontrado en vivo 2026-09-01: con la request
  // bloqueada (mismo gap de CORS de playwright/README.md), el mapeo quedaba
  // con nombres de campo bien resueltos (autoMapHeaders, local) pero el tipo
  // de dato de cada columna sin la corrección de la IA, sin ningún indicio
  // visible en el paso mismo de que la sugerencia había fallado. Este flag
  // sostiene un aviso persistente mientras el usuario está parado en "Mapeá
  // las columnas", no solo el toast que ya pasó.
  const [aiEnrichmentFailed, setAiEnrichmentFailed] = useState(false);

  // Per-connection sync state — each connection card syncs/tests
  // independently, and "Sincronizar todo" fills several of these at once.
  const [syncBusyConnectionId, setSyncBusyConnectionId] = useState<string | null>(null);
  const [syncAllBusy, setSyncAllBusy] = useState(false);
  const [syncResults, setSyncResults] = useState<Record<string, { result: SyncResult; wasDryRun: boolean }>>({});
  const [missingHeadersByConnection, setMissingHeadersByConnection] = useState<Record<string, string[]>>({});
  // save-sheet-mapping, 400 (contrato 2026-08-30): guard server-side contra
  // mapear la misma hoja+pestaña dos veces — complementa (no reemplaza) el
  // chequeo client-side ya hecho antes de llegar a este paso (ver el onClick
  // del paso 2 más abajo), por si dos pestañas del navegador crean una
  // conexión al mismo tiempo.
  const [duplicateConnectionId, setDuplicateConnectionId] = useState<string | null>(null);

  // ---- Subida de Excel (2026-08-30) — flujo aparte del wizard de Sheets:
  // no hay account_id/spreadsheet_id, hay un upload_id. Reusa el mismo paso
  // de mapeo de columnas (headers/periodColumn/fieldMappings de arriba) una
  // vez que el archivo terminó de subirse y parsearse.
  const [excelMode, setExcelMode] = useState(false);
  const [excelStep, setExcelStep] = useState<"pick_file" | "uploading" | "pick_sheet">("pick_file");
  const [excelUploadId, setExcelUploadId] = useState<string | null>(null);
  const [excelFileName, setExcelFileName] = useState("");
  const [excelSheets, setExcelSheets] = useState<WorkbookSheetPreview[]>([]);
  const [excelReuploadConnectionId, setExcelReuploadConnectionId] = useState<string | null>(null);
  const excelFileInputRef = useRef<HTMLInputElement>(null);

  // ---- Clasificación automática (classify-workbook, 2026-08-30) — corre
  // junto con analyze-transactional-sheet para una hoja/tab nueva (Sheets o
  // Excel), nunca al editar una conexión ya existente.
  const [classifying, setClassifying] = useState(false);
  const [classification, setClassification] = useState<ClassifiedSheet | null>(null);

  // ---- Rol de fuente / configuración de sync por conexión — panel
  // secundario dentro de cada card de conexión, no un wizard aparte.
  const [settingsConnectionId, setSettingsConnectionId] = useState<string | null>(null);
  const [savingDataRole, setSavingDataRole] = useState(false);
  const [savingSyncSettings, setSavingSyncSettings] = useState(false);

  // ---- Entity resolution (resolve-entities, 2026-08-30) — dialog aparte,
  // abierto contra una conexión puntual (necesita sus field_mappings).
  const [entityResolutionConnection, setEntityResolutionConnection] = useState<SheetConnection | null>(null);
  // list-entity-aliases es company-wide (no toma connection_id) — un solo
  // dialog, no uno por conexión, a diferencia del de arriba.
  const [entityAliasesOpen, setEntityAliasesOpen] = useState(false);
  // list-duplicate-transactions sí es por conexión.
  const [duplicatesConnection, setDuplicatesConnection] = useState<SheetConnection | null>(null);

  const usedFieldKeys = Object.values(fieldMappings).map((m) => m.field_key);
  const usedColumnsCount = Object.keys(fieldMappings).length;
  const duplicateFieldKeys = useMemo(() => {
    const counts = new Map<string, number>();
    for (const k of usedFieldKeys) if (k) counts.set(k, (counts.get(k) ?? 0) + 1);
    return Array.from(counts.entries())
      .filter(([, c]) => c > 1)
      .map(([k]) => k);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [usedFieldKeys.join(",")]);
  const allMappingsValid = Object.values(fieldMappings).every((m) => m.field_key.trim().length > 0);
  const duplicateHeaders = useMemo(() => findDuplicateHeaders(headers), [headers]);
  const canSaveMappingTabular =
    !!periodColumn &&
    usedColumnsCount > 0 &&
    allMappingsValid &&
    duplicateFieldKeys.length === 0 &&
    duplicateHeaders.length === 0;

  // Para SuggestedMetricsReview: las categorías (tabs) que ya existen en el
  // catálogo real de la company, así una métrica sugerida por IA cae en un
  // tab existente por default en vez de inventar uno nuevo.
  const metricCategories = useMemo(() => {
    const seen = new Set<string>();
    for (const m of financial.metrics) seen.add(m.category);
    return Array.from(seen).map((id) => ({
      id,
      label: id.charAt(0).toUpperCase() + id.slice(1).replace(/_/g, " "),
    }));
  }, [financial.metrics]);

  const wizardAccount = accounts.find((a) => a.account_id === wizardAccountId) ?? null;
  const sheetConnections = useMemo(() => connections.filter((c) => c.source !== "excel"), [connections]);
  const excelConnections = useMemo(() => connections.filter((c) => c.source === "excel"), [connections]);
  const connectionsByAccount = useMemo(() => {
    const map = new Map<string, SheetConnection[]>();
    for (const c of sheetConnections) {
      if (!c.account_id) continue;
      const list = map.get(c.account_id) ?? [];
      list.push(c);
      map.set(c.account_id, list);
    }
    return map;
  }, [sheetConnections]);

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
      // order_by=modified_time (2026-08-30): sin esto, list-sheets devuelve
      // TODAS las planillas del Drive personal sin ranking — confirmado en
      // vivo: ~200 archivos sin relación con la empresa. Ordenar por
      // modificación reciente es un proxy barato de relevancia mientras no
      // exista clasificación real por IA de "cuál es tu planilla financiera".
      const qs = `?company_id=${encodeURIComponent(company_id)}&account_id=${encodeURIComponent(accountId)}&order_by=modified_time`;
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
    // Solo para una conexión NUEVA (!seed): dispara el auto-mapeo por IA
    // encima del seed local de autoMapHeaders, sin bloquear el render de las
    // columnas (headers/loadingHeaders ya se resolvieron antes de esto —
    // corre en segundo plano, ver analyzingSheet más abajo para el indicador
    // inline). Nunca al editar una conexión existente, para no pisarle en
    // silencio los nombres de campo ya guardados.
    let autoMapped: { hs: string[]; periodColumn: string | null; sampleRows: string[][] } | null = null;
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
      const sampleRowsData: string[][] = Array.isArray(data?.sample_rows) ? data.sample_rows : [];
      setHeaders(hs);
      setSampleRows(sampleRowsData);
      if (seed) {
        const missing: string[] = [];
        const seededPeriod = hs.includes(seed.period_column) ? seed.period_column : null;
        if (!seededPeriod) missing.push(seed.period_column);
        const seededMappings: Record<string, DraftFieldMapping> = {};
        for (const fm of seed.field_mappings ?? []) {
          if (!hs.includes(fm.column)) {
            missing.push(fm.column);
            continue;
          }
          const seededDescription = fm.description ?? "";
          seededMappings[fm.column] = {
            column: fm.column,
            field_key: fm.field_key,
            value_type: fm.value_type,
            description: seededDescription,
            originalDescription: seededDescription,
          };
        }
        setPeriodColumn(seededPeriod);
        setFieldMappings(seededMappings);
        setStaleHeaders(Array.from(new Set(missing)));
      } else {
        const auto = autoMapHeaders(hs);
        setPeriodColumn(auto.periodColumn);
        setFieldMappings(auto.fieldMappings);
        setStaleHeaders([]);
        autoMapped = { hs, periodColumn: auto.periodColumn, sampleRows: sampleRowsData };
      }
    } catch {
      toast.error("No se pudieron leer las columnas de la hoja");
    } finally {
      setLoadingHeaders(false);
    }

    if (!autoMapped) return;
    // classify-workbook se espera antes de decidir qué análisis correr —
    // "layout" (row_based/grid/eav) determina si sigue el flujo de
    // analyze-transactional-sheet (fila por período, de siempre) o si esta
    // hoja necesita extract-sheet-layout (período en columnas/filas, o
    // formato vertical fecha/métrica/valor). Antes esto no se esperaba y
    // analyze-transactional-sheet corría siempre, sin importar el tipo real
    // de la hoja — el bug que encontró el usuario con el estado de
    // resultados ancho.
    setClassifying(true);
    const cls = await classifyWorkbook(sheetName, autoMapped.hs, autoMapped.sampleRows, "sheet");
    setClassifying(false);
    const layout: SheetLayout = cls?.layout ?? "row_based";
    setSheetLayout(layout);
    setLayoutOverride(null);
    setLayoutExtraction(null);
    if (layout === "grid" || layout === "eav") {
      await extractSheetLayout(layout, { sheetName, excel: false, accountId, spreadsheetId });
      return;
    }

    setAiEnrichmentFailed(false);
    const analysis = await analyzeTransactionalSheet({
      source: "sheet",
      accountId,
      spreadsheetId,
      sheetName,
      headers: autoMapped.hs,
      sampleRows: autoMapped.sampleRows,
      spreadsheetType: cls?.spreadsheet_type,
    });
    if (!analysis) {
      setAiEnrichmentFailed(true);
      return;
    }

    const suggestedCount = analysis.suggested_fields.filter((f) => f.column !== autoMapped!.periodColumn).length;
    if (suggestedCount > 0) {
      setFieldMappings((prev) => {
        const next = { ...prev };
        for (const f of analysis.suggested_fields) {
          if (f.column === autoMapped!.periodColumn) continue;
          next[f.column] = { column: f.column, field_key: f.field_key, value_type: f.value_type, description: "", originalDescription: "" };
        }
        return next;
      });
      toast.success(
        `IA mapeó ${suggestedCount} columna${suggestedCount === 1 ? "" : "s"}. Revisá los nombres abajo antes de guardar.`
      );
    }
    // No se abre la revisión todavía acá a propósito: las métricas sugeridas
    // referencian field_keys (ej. FIELDSUM-style aggregation sobre
    // "inversion") que recién existen del lado backend una vez que se
    // guarda el mapeo (Guardar mapeo, más abajo) — confirmarlas antes tira
    // 400 "aggregation referencia un field_key inexistente" (bug real
    // encontrado en vivo 2026-08-15). Se guarda el resultado y se abre la
    // revisión recién en handleSaveMapping, tras un guardado exitoso.
    if (analysis.suggested_metrics.length > 0 || analysis.metrics_needing_more_data.length > 0) {
      setSuggestedMetrics(analysis.suggested_metrics);
      setMetricsNeedingMoreData(analysis.metrics_needing_more_data);
    }
  };

  // classify-workbook — puramente informativo (spreadsheet_type +
  // suggested_data_role con confidence real), nunca bloquea el mapeo si
  // falla o se agota el cupo de IA "onboarding". Se llama tanto desde
  // loadHeaders (Sheets) como desde el flujo de Excel, una sola vez por
  // hoja/tab nueva — nunca al editar una conexión existente.
  const classifyWorkbook = async (sheetName: string, hs: string[], sampleRows: string[][], source: "sheet" | "excel" = "sheet"): Promise<ClassifiedSheet | null> => {
    if (!company_id) return null;
    setClassification(null);
    try {
      const res = await fetch(CLASSIFY_WORKBOOK_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id, source, sheets: [{ sheet_name: sheetName, headers: hs, sample_rows: sampleRows }] }),
      });
      if (!res.ok) return null; // no bloqueante — 429/503/400 se ignoran en silencio, es solo una sugerencia
      const data = await res.json();
      const sheets: ClassifiedSheet[] = Array.isArray(data?.sheets) ? data.sheets : [];
      const found = sheets.find((s) => s.sheet_name === sheetName) ?? null;
      setClassification(found);
      return found;
    } catch {
      // silencioso — puramente informativo
      return null;
    }
  };

  // ---- extract-sheet-layout (2026-08-31) — reemplaza a
  // analyze-transactional-sheet cuando classify-workbook detecta layout
  // "grid"/"eav" para esta hoja. El founder siempre puede cambiar el
  // mecanismo a mano (layoutOverride) sin importar lo que sugirió la IA.
  const [sheetLayout, setSheetLayout] = useState<SheetLayout>("row_based");
  const [layoutOverride, setLayoutOverride] = useState<SheetLayout | null>(null);
  const [layoutExtraction, setLayoutExtraction] = useState<ExtractSheetLayoutResponse | null>(null);
  const [extractingLayout, setExtractingLayout] = useState(false);
  const effectiveLayout: SheetLayout = layoutOverride ?? sheetLayout;
  // Copias editables — el founder puede corregir cualquier campo sugerido
  // antes de confirmar (pedido explícito del contrato de backend), nunca se
  // manda la sugerencia de la IA tal cual sin poder tocarla.
  const [gridConceptAxis, setGridConceptAxis] = useState<ConceptAxisEntry[]>([]);
  const [eavMetricMapping, setEavMetricMapping] = useState<EavMetricMapping[]>([]);

  // Toma los identificadores como parámetros explícitos (no del estado del
  // componente) — se llama desde loadHeaders/handleExcelSheetPicked justo
  // cuando esos valores recién se están fijando, antes de que el estado
  // termine de actualizarse.
  const extractSheetLayout = async (
    layoutHint: Extract<SheetLayout, "grid" | "eav">,
    ctx?: { sheetName: string; excel: boolean; uploadId?: string | null; accountId?: string | null; spreadsheetId?: string | null },
    force = false
  ): Promise<ExtractSheetLayoutResponse | null> => {
    const sheetName = ctx?.sheetName ?? selectedSheetName;
    if (!company_id || !sheetName) return null;
    const isExcel = ctx?.excel ?? excelMode;
    setExtractingLayout(true);
    setLayoutExtraction(null);
    try {
      const body: ExtractSheetLayoutRequest = isExcel
        ? { company_id, sheet_name: sheetName, layout_hint: layoutHint, source: "excel", upload_id: (ctx?.uploadId ?? excelUploadId) ?? undefined, force }
        : { company_id, sheet_name: sheetName, layout_hint: layoutHint, source: "sheet", account_id: (ctx?.accountId ?? wizardAccountId) ?? undefined, spreadsheet_id: (ctx?.spreadsheetId ?? selectedSpreadsheetId) ?? undefined, force };
      const res = await fetch(EXTRACT_SHEET_LAYOUT_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error ?? "No pudimos entender la estructura de esta hoja. Podés mapearla a mano.");
        setLayoutOverride("row_based");
        return null;
      }
      const data = (await res.json()) as ExtractSheetLayoutResponse;
      setLayoutExtraction(data);
      if (data.layout === "grid") {
        setGridConceptAxis(data.concept_axis.map((c) => ({ ...c, value_type: normalizeConceptValueType(c.value_type) })));
      } else {
        setEavMetricMapping(data.eav_metric_mapping.map((m) => ({ ...m, value_type: normalizeConceptValueType(m.value_type) })));
      }
      return data;
    } catch {
      toast.error("No pudimos entender la estructura de esta hoja. Podés mapearla a mano.");
      setLayoutOverride("row_based");
      return null;
    } finally {
      setExtractingLayout(false);
    }
  };

  // El founder cambia el mecanismo a mano (selector en el paso 3) —
  // dispara extract-sheet-layout si hace falta, o vuelve al mapeo de
  // columnas de siempre si elige "row_based".
  const handleLayoutOverride = (next: SheetLayout) => {
    setLayoutOverride(next);
    if (next === "grid" || next === "eav") {
      if (!layoutExtraction || layoutExtraction.layout !== next) extractSheetLayout(next);
    }
  };

  const handleReanalyzeLayout = () => {
    if (effectiveLayout === "grid" || effectiveLayout === "eav") extractSheetLayout(effectiveLayout, undefined, true);
  };

  const canSaveMapping =
    effectiveLayout === "row_based"
      ? canSaveMappingTabular
      : effectiveLayout === "grid"
        ? !extractingLayout && layoutExtraction?.layout === "grid" && gridConceptAxis.length > 0
        : !extractingLayout && layoutExtraction?.layout === "eav" && eavMetricMapping.length > 0;

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
    setSampleRows([]);
    setPeriodColumn(null);
    setFieldMappings({});
    setStaleHeaders([]);
    setCrossConnectionDuplicateKeys([]);
    setDuplicateConnectionId(null);
    setSheetSearch("");
    setTabSearch("");
    setClassification(null);
    setSheetLayout("row_based");
    setLayoutOverride(null);
    setLayoutExtraction(null);
    setGridConceptAxis([]);
    setEavMetricMapping([]);
  };

  const resetExcelWizard = () => {
    setExcelMode(false);
    setExcelStep("pick_file");
    setExcelUploadId(null);
    setExcelFileName("");
    setExcelSheets([]);
    setExcelReuploadConnectionId(null);
    if (excelFileInputRef.current) excelFileInputRef.current.value = "";
  };

  // Limpia sugerencias de una hoja NUEVA analizada antes de arrancar un
  // wizard distinto — editar una conexión existente no vuelve a llamar a
  // analyzeTransactionalSheet (ver loadHeaders: el branch "seed" no
  // autoanaliza), así que sin este reset podían quedar colgadas en el
  // estado y aparecer al guardar el mapeo de una conexión que no tiene
  // nada que ver. Deliberadamente NO vive en resetWizardData(): esa función
  // también la llama handleSaveMapping vía cancelWizard() justo antes de
  // abrir la revisión de sugerencias, y limpiar ahí las vaciaba antes de
  // que el diálogo llegara a mostrarlas (confirmado en vivo 2026-08-15).
  const resetSuggestedMetrics = () => {
    setSuggestedMetrics([]);
    setMetricsNeedingMoreData([]);
    setAiEnrichmentFailed(false);
  };

  const openAddConnection = (accountId: string) => {
    resetWizardData();
    resetSuggestedMetrics();
    setEditingConnectionId(null);
    setWizardAccountId(accountId);
    loadSheets(accountId);
  };

  const openEditConnection = (conn: SheetConnection) => {
    // Excel connections nunca llegan acá (no tienen account_id/spreadsheet_id
    // — se editan resubiendo una versión nueva, ver openExcelUpload).
    if (!conn.account_id || !conn.spreadsheet_id) return;
    const accountId = conn.account_id;
    const spreadsheetId = conn.spreadsheet_id;
    resetWizardData();
    resetSuggestedMetrics();
    setEditingConnectionId(conn.connection_id);
    setWizardAccountId(accountId);
    setSelectedSpreadsheetId(spreadsheetId);
    setSelectedSpreadsheetName(conn.spreadsheet_name);
    setSelectedSheetName(conn.sheet_name);
    // Editar salta directo a Mapear columnas — no hay nada que "reconocer"
    // (classify-workbook nunca corre de nuevo al editar, ver el guard
    // !editingConnectionId más abajo).
    setStep(4);
    setLoadingEditConnection(true);
    Promise.all([
      loadSheets(accountId),
      loadTabs(accountId, spreadsheetId),
      loadHeaders(accountId, spreadsheetId, conn.sheet_name, conn),
    ]).finally(() => setLoadingEditConnection(false));
  };

  const cancelWizard = () => {
    setWizardAccountId(null);
    setEditingConnectionId(null);
    resetWizardData();
    resetExcelWizard();
  };

  const openExcelUpload = (reuploadConnectionId?: string) => {
    resetWizardData();
    resetSuggestedMetrics();
    resetExcelWizard();
    setExcelMode(true);
    setExcelReuploadConnectionId(reuploadConnectionId ?? null);
  };

  const handleExcelFileChange = async (file: File | undefined) => {
    if (!file || !company_id) return;
    if (file.type !== EXCEL_CONTENT_TYPE && !file.name.toLowerCase().endsWith(".xlsx")) {
      toast.error("Solo se soportan archivos .xlsx");
      return;
    }
    setExcelFileName(file.name);
    setExcelStep("uploading");
    try {
      const res = await fetch(REQUEST_WORKBOOK_UPLOAD_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id,
          file_name: file.name,
          content_type: EXCEL_CONTENT_TYPE,
          ...(excelReuploadConnectionId ? { connection_id: excelReuploadConnectionId } : {}),
        }),
      });
      if (res.status === 400) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error ?? "No se pudo iniciar la subida del archivo");
        setExcelStep("pick_file");
        return;
      }
      if (await handleMembershipError(res)) {
        setExcelStep("pick_file");
        return;
      }
      const { upload_id, upload_url } = await res.json();
      const putRes = await fetch(upload_url, { method: "PUT", headers: { "Content-Type": EXCEL_CONTENT_TYPE }, body: file });
      if (!putRes.ok) {
        toast.error("No se pudo subir el archivo. Probá de nuevo.");
        setExcelStep("pick_file");
        return;
      }
      const confirmRes = await fetch(CONFIRM_WORKBOOK_UPLOAD_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id, upload_id }),
      });
      if (await handleMembershipError(confirmRes)) {
        setExcelStep("pick_file");
        return;
      }
      const confirmData = await confirmRes.json();
      if (confirmData?.status === "error") {
        toast.error("No pudimos leer este archivo como un .xlsx válido. Probá con otro.");
        setExcelStep("pick_file");
        return;
      }
      // El resultado ya viene en la respuesta de confirm (síncrono) — no
      // hace falta hacer polling con get-upload-status para el caso feliz.
      const statusRes = await fetch(`${GET_UPLOAD_STATUS_URL}?upload_id=${encodeURIComponent(upload_id)}`, {
        credentials: "include",
      });
      const statusData = statusRes.ok ? await statusRes.json() : null;
      const sheets: WorkbookSheetPreview[] = Array.isArray(statusData?.sheets) ? statusData.sheets : [];
      setExcelUploadId(upload_id);
      setExcelSheets(sheets);
      setExcelStep("pick_sheet");
      if (sheets.length === 1) {
        handleExcelSheetPicked(sheets[0], upload_id);
      }
    } catch {
      toast.error("No se pudo subir el archivo");
      setExcelStep("pick_file");
    }
  };

  // uploadIdOverride: cuando se llama justo después de setExcelUploadId (el
  // auto-pick de un workbook de una sola hoja, ver handleExcelFileChange),
  // el estado todavía no se aplicó — leer excelUploadId acá adentro daría el
  // valor viejo (null). Mismo patrón que ya usa extractSheetLayout.
  const handleExcelSheetPicked = async (sheet: WorkbookSheetPreview, uploadIdOverride?: string) => {
    setSelectedSpreadsheetName(excelFileName);
    setSelectedSheetName(sheet.sheet_name);
    setHeaders(sheet.headers);
    const sampleRowsData = sheet.sample_rows.map((r) => r.map((c) => String(c ?? "")));
    setSampleRows(sampleRowsData);
    const auto = autoMapHeaders(sheet.headers);
    setPeriodColumn(auto.periodColumn);
    setFieldMappings(auto.fieldMappings);
    setStaleHeaders([]);
    setStep(3);
    setLayoutOverride(null);
    setLayoutExtraction(null);
    setClassifying(true);
    const cls = await classifyWorkbook(sheet.sheet_name, sheet.headers, sampleRowsData, "excel");
    setClassifying(false);
    const layout: SheetLayout = cls?.layout ?? "row_based";
    setSheetLayout(layout);
    if (layout === "grid" || layout === "eav") {
      extractSheetLayout(layout, { sheetName: sheet.sheet_name, excel: true, uploadId: uploadIdOverride ?? excelUploadId });
      return;
    }
    // analyze-transactional-sheet ahora acepta Excel (contrato 2026-09-01,
    // antes este paso se saltaba directo a mapeo manual para Excel porque
    // el backend no podía procesarlo) — mismo sugerido de campos/métricas
    // que ya tenía Sheets.
    setAiEnrichmentFailed(false);
    const analysis = await analyzeTransactionalSheet({
      source: "excel",
      sheetName: sheet.sheet_name,
      headers: sheet.headers,
      sampleRows: sampleRowsData,
      spreadsheetType: cls?.spreadsheet_type,
    });
    if (!analysis) {
      setAiEnrichmentFailed(true);
      return;
    }
    const suggestedCount = analysis.suggested_fields.filter((f) => f.column !== auto.periodColumn).length;
    if (suggestedCount > 0) {
      setFieldMappings((prev) => {
        const next = { ...prev };
        for (const f of analysis.suggested_fields) {
          if (f.column === auto.periodColumn) continue;
          next[f.column] = { column: f.column, field_key: f.field_key, value_type: f.value_type, description: "", originalDescription: "" };
        }
        return next;
      });
      toast.success(
        `IA mapeó ${suggestedCount} columna${suggestedCount === 1 ? "" : "s"}. Revisá los nombres abajo antes de guardar.`
      );
    }
    if (analysis.suggested_metrics.length > 0 || analysis.metrics_needing_more_data.length > 0) {
      setSuggestedMetrics(analysis.suggested_metrics);
      setMetricsNeedingMoreData(analysis.metrics_needing_more_data);
    }
  };

  // get-workbook-download-url (2026-08-31) — se pide recién al hacer click,
  // nunca se cachea (la signed URL expira en 60 min). Solo aplica a
  // conexiones source: "excel" — las de Sheets no tienen archivo propio.
  const [downloadingConnectionId, setDownloadingConnectionId] = useState<string | null>(null);
  const handleViewOriginalFile = async (connectionId: string) => {
    if (!company_id) return;
    setDownloadingConnectionId(connectionId);
    try {
      const res = await fetch(
        `${GET_WORKBOOK_DOWNLOAD_URL}?company_id=${encodeURIComponent(company_id)}&connection_id=${encodeURIComponent(connectionId)}`,
        { credentials: "include" }
      );
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error ?? "No se pudo obtener el archivo original");
        return;
      }
      const data = (await res.json()) as GetWorkbookDownloadUrlResponse;
      window.open(data.download_url, "_blank", "noopener,noreferrer");
    } catch {
      toast.error("No se pudo obtener el archivo original");
    } finally {
      setDownloadingConnectionId(null);
    }
  };

  const cancelExcelUpload = async () => {
    if (excelUploadId && company_id) {
      try {
        await fetch(DELETE_WORKBOOK_UPLOAD_URL, {
          method: "DELETE",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ company_id, upload_id: excelUploadId }),
        });
      } catch {
        // best-effort — el usuario ya está cancelando, no hace falta bloquear ni avisar
      }
    }
    resetExcelWizard();
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

  const handleSetDataRole = async (connectionId: string, dataRole: DataRole | null) => {
    if (!company_id) return;
    setSavingDataRole(true);
    try {
      const res = await fetch(SET_CONNECTION_DATA_ROLE_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id, connection_id: connectionId, data_role: dataRole }),
      });
      if (await handleMembershipError(res)) return;
      toast.success("Rol de la fuente actualizado");
      await loadConnections();
    } catch {
      toast.error("No se pudo actualizar el rol de la fuente");
    } finally {
      setSavingDataRole(false);
    }
  };

  const handleSetSyncSettings = async (
    connectionId: string,
    settings: { sync_mode?: SyncMode | null; sync_frequency?: SyncFrequency | null; freshness_sla?: string | null }
  ) => {
    if (!company_id) return;
    setSavingSyncSettings(true);
    try {
      const res = await fetch(SET_CONNECTION_SYNC_SETTINGS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_id, connection_id: connectionId, ...settings }),
      });
      if (res.status === 400) {
        const err = await res.json().catch(() => ({}));
        toast.error(err?.error ?? "No se pudo actualizar la configuración de sincronización");
        return;
      }
      if (await handleMembershipError(res)) return;
      toast.success("Configuración de sincronización actualizada");
      await loadConnections();
    } catch {
      toast.error("No se pudo actualizar la configuración de sincronización");
    } finally {
      setSavingSyncSettings(false);
    }
  };

  // Compara el mapeo existente de la conexión (si estamos editando una) contra
  // el draft actual — cualquier field_key que desaparece o cambia de
  // value_type puede romper una métrica calculada que ya lo referencia
  // (FIELDSUM/etc.). findMetricsUsingField ya existía para esto y no se
  // llamaba desde ningún lado.
  const findBreakingChanges = (): MetricDef[] => {
    if (!editingConnectionId) return [];
    // Grid/eav todavía no tienen esta comparación implementada — comparan
    // contra fieldMappings (el estado del modo tabular), que para estos dos
    // modos ni siquiera se llena. Devolver [] acá es correcto por ahora
    // (evita comparar contra un estado que no corresponde), a costa de no
    // avisar si un cambio de grid/eav rompe una métrica — gap conocido, no
    // fabricar una comparación que no es real.
    if (effectiveLayout !== "row_based") return [];
    const existing = connections.find((c) => c.connection_id === editingConnectionId);
    if (!existing) return [];
    const newByKey = new Map(Object.values(fieldMappings).map((m) => [m.field_key.trim(), m.value_type]));
    const atRiskKeys = existing.field_mappings
      .filter((old) => {
        const newType = newByKey.get(old.field_key);
        return newType === undefined || newType !== old.value_type;
      })
      .map((old) => old.field_key);
    const affected = new Map<string, MetricDef>();
    for (const key of atRiskKeys) {
      for (const m of findMetricsUsingField(key, financial.metrics)) affected.set(m.id, m);
    }
    return Array.from(affected.values());
  };

  const handleSaveMapping = async () => {
    if (!canSaveMapping) {
      toast.error("Revisá el mapeo: hay campos sin nombre o repetidos.");
      return;
    }
    const breaking = findBreakingChanges();
    if (breaking.length > 0) {
      setPendingBreakingChange(breaking);
      return;
    }
    await doSaveMapping();
  };

  const doSaveMapping = async (retry?: {
    attempt: number;
    gridConceptAxis: ConceptAxisEntry[];
    eavMetricMapping: EavMetricMapping[];
  }) => {
    if (!company_id || !selectedSheetName) return;
    if (effectiveLayout === "row_based" && !periodColumn) return;
    if (!excelMode && !wizardAccountId) return;
    if (!excelMode && !selectedSpreadsheetId) return;
    if (excelMode && !excelUploadId) return;
    setPendingBreakingChange(null);
    setSavingMapping(true);
    setDuplicateConnectionId(null);
    // En un reintento (ver err.layoutStale más abajo) se usa la lista ya
    // corregida que se pasó explícitamente, nunca el estado del componente
    // directo — setGridConceptAxis/setEavMetricMapping son asíncronos y esta
    // misma llamada recursiva no vería el valor actualizado a tiempo.
    const currentGridConceptAxis = retry?.gridConceptAxis ?? gridConceptAxis;
    const currentEavMetricMapping = retry?.eavMetricMapping ?? eavMetricMapping;
    try {
      const common = {
        company_id,
        connection_id: editingConnectionId ?? excelReuploadConnectionId ?? undefined,
        ...(excelMode
          ? { source: "excel" as const, upload_id: excelUploadId ?? undefined, spreadsheet_name: excelFileName }
          : { source: "sheet" as const, account_id: wizardAccountId ?? undefined, spreadsheet_id: selectedSpreadsheetId ?? undefined, spreadsheet_name: selectedSpreadsheetName }),
        sheet_name: selectedSheetName,
      };
      let requestBody: SaveSheetMappingRequest;
      if (effectiveLayout === "grid" && layoutExtraction?.layout === "grid") {
        requestBody = {
          ...common,
          structure: "grid",
          period_orientation: layoutExtraction.period_orientation,
          period_axis: layoutExtraction.period_axis,
          concept_axis: currentGridConceptAxis,
        };
      } else if (effectiveLayout === "eav" && layoutExtraction?.layout === "eav") {
        requestBody = {
          ...common,
          structure: "eav",
          eav_period_column: layoutExtraction.eav_period_column,
          eav_metric_name_column: layoutExtraction.eav_metric_name_column,
          eav_value_column: layoutExtraction.eav_value_column,
          eav_metric_mapping: currentEavMetricMapping,
        };
      } else {
        const field_mappings: FieldMapping[] = Object.values(fieldMappings).map((m) => ({
          column: m.column,
          field_key: m.field_key.trim(),
          value_type: m.value_type,
          // Ausente cuando está vacía — así el backend la genera con IA. Si
          // tiene contenido (el usuario la escribió o ya venía de un guardado
          // anterior), se manda tal cual: el backend nunca la sobrescribe.
          ...(m.description.trim() ? { description: m.description.trim() } : {}),
        }));
        requestBody = { ...common, structure: "tabular", period_column: periodColumn!, field_mappings };
      }
      const res = await fetch(SAVE_SHEET_MAPPING_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(requestBody),
      });
      if (res.status === 400) {
        const err = await parseSheetsError(res);
        if (err.sourceDisabled || err.reconnectRequired) {
          await loadAccounts();
          return;
        }
        if (err.layoutStale) {
          if (effectiveLayout !== "grid" && effectiveLayout !== "eav") {
            toast.error(err.message ?? "La hoja cambió desde que se analizó su estructura. Volvé a intentar guardar.");
            return;
          }
          const attempt = retry?.attempt ?? 0;
          if (attempt >= MAX_LAYOUT_STALE_ATTEMPTS) {
            // Solución real, no solo un mensaje: mientras haya una única fila
            // (o unas pocas) sin ningún dato cargado, el bucle de abajo la
            // detecta y la excluye sola en 1-2 vueltas. Llegar acá significa
            // que sigue habiendo inconsistencia después de varios intentos —
            // el botón de guardar sigue funcionando normalmente (no es un
            // callejón sin salida), cada click nuevo repite el mismo proceso
            // de detección y filtrado desde cero.
            toast.error(
              "La hoja sigue sin coincidir con lo último analizado después de varios intentos. Volvé a apretar \"Guardar mapeo\": cada intento excluye automáticamente las filas inconsistentes hasta que coincida.",
              { duration: 10000 }
            );
            return;
          }
          // Reextrae la estructura real ahora mismo y compara qué se mandó a
          // guardar contra lo que acaba de volver: la fila que aparece en una
          // lista y no en la otra es, con la evidencia confirmada en vivo, la
          // que no tiene ningún dato cargado (ver findMissingOrNewConcepts).
          const fresh = await extractSheetLayout(effectiveLayout, undefined, true);
          if (!fresh) return; // extractSheetLayout ya avisó del error real.
          const submittedLabels =
            effectiveLayout === "grid"
              ? currentGridConceptAxis.map((c) => c.label)
              : currentEavMetricMapping.map((m) => m.observed_value);
          const freshLabels =
            fresh.layout === "grid" ? fresh.concept_axis.map((c) => c.label) : fresh.eav_metric_mapping.map((m) => m.observed_value);
          const diff = findMissingOrNewConcepts(submittedLabels, freshLabels);
          let nextGrid =
            fresh.layout === "grid"
              ? fresh.concept_axis.map((c) => ({ ...c, value_type: normalizeConceptValueType(c.value_type) }))
              : currentGridConceptAxis;
          let nextEav =
            fresh.layout === "eav"
              ? fresh.eav_metric_mapping.map((m) => ({ ...m, value_type: normalizeConceptValueType(m.value_type) }))
              : currentEavMetricMapping;
          if (diff.length > 0) {
            if (fresh.layout === "grid") nextGrid = nextGrid.filter((c) => !diff.includes(c.label));
            else nextEav = nextEav.filter((m) => !diff.includes(m.observed_value));
            toast.error(
              diff.length === 1
                ? `"${diff[0]}" no tiene ningún dato cargado en esta hoja. La excluimos del mapeo para guardar el resto ahora. Si más adelante cargás datos ahí, volvé a analizar la hoja desde este paso.`
                : `${diff.length} filas no tienen ningún dato cargado en esta hoja. Las excluimos del mapeo para guardar el resto ahora. Si más adelante les cargás datos, volvé a analizar la hoja desde este paso.`,
              { duration: 9000 }
            );
          } else {
            toast.error("La hoja cambió desde que se analizó su estructura. Reintentando con los datos actualizados.");
          }
          setGridConceptAxis(nextGrid);
          setEavMetricMapping(nextEav);
          await doSaveMapping({ attempt: attempt + 1, gridConceptAxis: nextGrid, eavMetricMapping: nextEav });
          return;
        }
        if (err.missingHeaders?.length) {
          setStaleHeaders(err.missingHeaders);
          toast.error("Algunas columnas del mapeo ya no existen en la hoja. Revisalas abajo.");
          return;
        }
        if (err.duplicateFieldKeys && Object.keys(err.duplicateFieldKeys).length > 0) {
          setCrossConnectionDuplicateKeys(Object.keys(err.duplicateFieldKeys));
          toast.error("Algunos nombres de campo ya se usan en otra hoja conectada. Elegí otro nombre para poder guardar.");
          return;
        }
        if (err.duplicateConnectionId) {
          setDuplicateConnectionId(err.duplicateConnectionId);
          toast.error("Ya existe otra conexión activa para esta misma hoja y pestaña.");
          return;
        }
        if (err.invalidValueTypes?.length) {
          const fields = err.invalidValueTypes.map((v) => v.field_key).join(", ");
          const allowed = err.allowedValueTypes?.length ? ` (válidos: ${err.allowedValueTypes.join(", ")})` : "";
          toast.error(`Tipo de dato inválido en: ${fields}${allowed}. Corregilo arriba y volvé a guardar.`);
          return;
        }
        toast.error(err.message ?? "No se pudo guardar el mapeo");
        return;
      }
      if (await handleMembershipError(res)) return;
      const saveData = await res.json();
      toast.success("Mapeo guardado");
      await loadConnections();
      if (excelMode) {
        // La ingesta de Excel corre síncrona dentro de este mismo request —
        // a diferencia de Sheets, no hace falta (ni corresponde) disparar un
        // sync aparte.
        const ingest = saveData?.ingest_result;
        if (ingest) {
          if (ingest.status === "error") {
            toast.error("No se pudo procesar ninguna fila del archivo. Revisá el formato.");
          } else if (ingest.rows_rejected > 0) {
            toast.error(`Cargado con errores: ${ingest.rows_processed} fila(s) guardada(s), ${ingest.rows_rejected} rechazada(s).`);
          } else {
            toast.success(`${ingest.rows_processed} fila(s) cargada(s) desde el Excel.`);
          }
        }
        await financial.reloadLogs();
        if (suggestedMetrics.length > 0 || metricsNeedingMoreData.length > 0) {
          setStep(5);
        } else {
          cancelWizard();
        }
        return;
      }
      // El connection_id de una conexión nueva no vuelve en la respuesta de
      // save-sheet-mapping — se busca en la lista recién recargada por la
      // combinación que la identifica unívocamente, para sincronizarla de
      // una — guardar el mapeo sin cargar los datos reales todavía dejaba
      // al usuario con un mapeo "guardado" pero sin ninguna fila importada
      // hasta que volviera a apretar "Sincronizar" a mano (bug real
      // reportado 2026-08-11: fórmulas que dependían de este campo se veían
      // vacías/en 0 aunque la hoja sí tuviera datos).
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
      if (syncTargetId) await runConnectionSync(syncTargetId, false);
      // Recién acá los field_keys sugeridos existen del lado backend (ver
      // nota en el handler de análisis) — es seguro dejar confirmar.
      if (suggestedMetrics.length > 0 || metricsNeedingMoreData.length > 0) {
        setStep(5);
      } else {
        cancelWizard();
      }
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

  const showWizard = wizardAccountId !== null || excelMode;
  const anyConnections = connections.length > 0;

  return (
    <AppLayout>
      {/* Ancho intencionalmente menor al resto (max-w-6xl): es un wizard de
          pasos secuenciales, no una tabla o lista — más ancho no aporta. */}
      <div className="max-w-3xl mx-auto px-8 py-12">
        <BackLink to="/metrics" label="Volver a Growth Tracker" className="mb-6" />
        <PageHeader
          title="Fuentes de datos"
          subtitle="Conectá Google Sheets o subí un Excel para sincronizar tus métricas automáticamente, en vez de cargarlas a mano."
        />

        {/* Estos 4 botones no van en el `action` de PageHeader a propósito: ese
            slot es `shrink-0` y, con 4 botones, se queda con su ancho completo
            sin ceder nada — eso angostaba el título de arriba a una columna de
            una palabra. Como fila propia, con todo el ancho de la página, el
            flex-wrap tiene margen real para envolver. */}
        {!showWizard && !loadingAccounts && (
          <div className="flex flex-wrap items-center gap-2 mb-8 -mt-4">
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
            {anyConnections && (
              <Button variant="outline" size="sm" onClick={() => setEntityAliasesOpen(true)}>
                Gestionar entidades
              </Button>
            )}
            <Button variant="outline" size="sm" onClick={() => openExcelUpload()} disabled={sourcePaused}>
              <Upload size={13} className="mr-1.5" />
              Subir Excel
            </Button>
            {accounts.length > 0 && (
              <Button size="sm" onClick={handleConnect} disabled={connecting || sourcePaused}>
                <Plus size={13} className="mr-1.5" />
                {connecting ? "Conectando…" : "Conectar otra cuenta"}
              </Button>
            )}
          </div>
        )}

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

        {!loadingAccounts && !loadingConnections && !showWizard && accounts.length === 0 && excelConnections.length === 0 && sourcePaused && (
          <EmptyState
            icon={FileSpreadsheet}
            title="Google Sheets está pausado para tu startup"
            description="Un administrador de CloudValley tiene que habilitar esta fuente antes de que puedas conectar una cuenta. Podés seguir subiendo archivos Excel mientras tanto."
            action={{ label: "Subir Excel", onClick: () => openExcelUpload() }}
          />
        )}

        {!loadingAccounts && !loadingConnections && !showWizard && accounts.length === 0 && excelConnections.length === 0 && !sourcePaused && (
          <EmptyState
            icon={FileSpreadsheet}
            title="Todavía no conectaste ninguna fuente de datos"
            description="Conectá una cuenta de Google o subí un Excel, elegís una hoja, mapeás sus columnas a tus métricas, y a partir de ahí queda disponible en Métricas. Podés conectar más de una fuente si tus datos están repartidos."
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
                            <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                              <div className="min-w-0">
                                <p className="text-sm font-medium flex items-center gap-1.5 min-w-0" title={`${conn.spreadsheet_name} · ${conn.sheet_name}`}>
                                  <FileSpreadsheet size={13} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                                  <span className="shrink-0">{conn.sheet_name}</span>
                                  <span className="truncate min-w-0 text-muted-foreground font-normal">· {conn.spreadsheet_name}</span>
                                </p>
                                <p className="text-xs text-muted-foreground mt-0.5">
                                  {fieldCountLabel(conn.field_mappings)} · última
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
                                <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                                  <Badge variant="outline" className="text-[10px]">
                                    {conn.source === "excel" ? "Excel" : "Google Sheets"}
                                  </Badge>
                                  {conn.data_role && (
                                    <Badge variant="secondary" className="text-[10px]">
                                      {DATA_ROLE_LABELS[conn.data_role]}
                                    </Badge>
                                  )}
                                  <Badge variant="outline" className="text-[10px] text-muted-foreground">
                                    {SYNC_MODE_LABELS[conn.sync_mode]}
                                    {conn.sync_frequency && ` · ${SYNC_FREQUENCY_LABELS[conn.sync_frequency]}`}
                                  </Badge>
                                </div>
                              </div>
                              <div className="flex flex-wrap items-center gap-1">
                                {conn.source === "excel" ? (
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    className="h-7 px-2 text-xs"
                                    onClick={() => openExcelUpload(conn.connection_id)}
                                    disabled={sourcePaused}
                                  >
                                    <Upload size={11} className="mr-1" />
                                    Subir nueva versión
                                  </Button>
                                ) : (
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
                                )}
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
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => setEntityResolutionConnection(conn)}
                                  title="Agrupa nombres distintos que son la misma entidad (ej: 'Acme Inc' y 'Acme Inc.') para que no se cuenten dos veces."
                                >
                                  Resolver entidades
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => setDuplicatesConnection(conn)}
                                >
                                  Ver duplicados
                                </Button>
                                <Button
                                  variant="ghost"
                                  size="sm"
                                  className="h-7 px-2 text-xs"
                                  onClick={() => setSettingsConnectionId((prev) => (prev === conn.connection_id ? null : conn.connection_id))}
                                >
                                  {settingsConnectionId === conn.connection_id ? "Cerrar" : "Configurar"}
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

                            {settingsConnectionId === conn.connection_id && (
                              <ConnectionSettingsPanel
                                connection={conn}
                                savingDataRole={savingDataRole}
                                savingSyncSettings={savingSyncSettings}
                                onSetDataRole={(role) => handleSetDataRole(conn.connection_id, role)}
                                onSetSyncSettings={(settings) => handleSetSyncSettings(conn.connection_id, settings)}
                              />
                            )}

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
                                    {(result.inserted_rows !== undefined || result.updated_rows !== undefined || result.deleted_rows !== undefined) && (
                                      <p className="text-muted-foreground mt-0.5">
                                        {result.inserted_rows ?? 0} nueva{result.inserted_rows === 1 ? "" : "s"} ·{" "}
                                        {result.updated_rows ?? 0} actualizada{result.updated_rows === 1 ? "" : "s"} ·{" "}
                                        {result.deleted_rows ?? 0} eliminada{result.deleted_rows === 1 ? "" : "s"}
                                      </p>
                                    )}
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

        {!loadingConnections && !showWizard && excelConnections.length > 0 && (
          <div className="space-y-4 mt-4">
            <SectionCard title="Archivos Excel subidos">
              <div className="space-y-2">
                {excelConnections.map((conn) => {
                  const missing = missingHeadersByConnection[conn.connection_id];
                  return (
                    <div key={conn.connection_id} className="border border-border rounded-md p-3">
                      <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-sm font-medium flex items-center gap-1.5 min-w-0" title={`${conn.spreadsheet_name} · ${conn.sheet_name}`}>
                            <FileSpreadsheet size={13} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                            <span className="truncate min-w-0">{conn.spreadsheet_name}</span>
                            <span className="shrink-0 text-muted-foreground font-normal">· {conn.sheet_name}</span>
                          </p>
                          <p className="text-xs text-muted-foreground mt-0.5">
                            {fieldCountLabel(conn.field_mappings)} · subido{" "}
                            {timeAgo(conn.last_synced_at)}
                          </p>
                          <div className="flex flex-wrap items-center gap-1.5 mt-1.5">
                            <Badge variant="outline" className="text-[10px]">
                              Excel
                            </Badge>
                            {conn.data_role && (
                              <Badge variant="secondary" className="text-[10px]">
                                {DATA_ROLE_LABELS[conn.data_role]}
                              </Badge>
                            )}
                          </div>
                        </div>
                        <div className="flex flex-wrap items-center gap-1">
                          <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={() => openExcelUpload(conn.connection_id)}>
                            <Upload size={11} className="mr-1" />
                            Subir nueva versión
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => handleViewOriginalFile(conn.connection_id)}
                            disabled={downloadingConnectionId === conn.connection_id}
                            title="Abre el archivo Excel tal como se subió, para confirmar qué se cargó."
                          >
                            {downloadingConnectionId === conn.connection_id ? "Abriendo…" : "Ver archivo original"}
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setEntityResolutionConnection(conn)}
                            title="Agrupa nombres distintos que son la misma entidad (ej: 'Acme Inc' y 'Acme Inc.') para que no se cuenten dos veces."
                          >
                            Resolver entidades
                          </Button>
                          <Button variant="ghost" size="sm" className="h-7 px-2 text-xs" onClick={() => setDuplicatesConnection(conn)}>
                            Ver duplicados
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-7 px-2 text-xs"
                            onClick={() => setSettingsConnectionId((prev) => (prev === conn.connection_id ? null : conn.connection_id))}
                          >
                            {settingsConnectionId === conn.connection_id ? "Cerrar" : "Configurar"}
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
                      {settingsConnectionId === conn.connection_id && (
                        <ConnectionSettingsPanel
                          connection={conn}
                          savingDataRole={savingDataRole}
                          savingSyncSettings={savingSyncSettings}
                          onSetDataRole={(role) => handleSetDataRole(conn.connection_id, role)}
                          onSetSyncSettings={(settings) => handleSetSyncSettings(conn.connection_id, settings)}
                        />
                      )}
                      {missing && missing.length > 0 && (
                        <div className="border border-destructive/40 bg-destructive/5 rounded-md p-2.5 mt-2.5 text-xs">
                          <p className="font-medium text-destructive">El archivo cambió de estructura</p>
                          <p className="text-muted-foreground mt-0.5">Estas columnas ya no existen: {missing.join(", ")}.</p>
                          <Button size="sm" className="mt-2 h-7 text-xs" onClick={() => openExcelUpload(conn.connection_id)}>
                            Subir versión corregida
                          </Button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </SectionCard>
          </div>
        )}

        {showWizard && (
          <div className="space-y-6">
            <p className="text-xs text-muted-foreground truncate">
              {excelMode ? excelFileName || "Subir Excel" : wizardAccount?.google_account_email}
            </p>
            <StepRail
              labels={excelMode ? EXCEL_STEP_LABELS : SHEETS_STEP_LABELS}
              current={excelMode ? EXCEL_STEP_INDEX[step] : step}
            />

            {excelMode && step === 1 && excelStep === "pick_file" && (
              <SectionCard title="Subí tu archivo Excel">
                <p className="text-xs text-muted-foreground mb-3">
                  Solo archivos .xlsx. Una vez subido, vas a poder mapear sus columnas igual que con Google Sheets.
                </p>
                <input
                  ref={excelFileInputRef}
                  type="file"
                  accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                  onChange={(e) => handleExcelFileChange(e.target.files?.[0])}
                  aria-label="Elegir archivo Excel"
                  className="text-sm"
                />
                <div className="mt-4">
                  <Button variant="ghost" onClick={cancelExcelUpload}>
                    Cancelar
                  </Button>
                </div>
              </SectionCard>
            )}

            {excelMode && step === 1 && excelStep === "uploading" && (
              <SectionCard title="Subiendo y procesando tu archivo">
                <LoadingState variant="centered" className="py-16" label="Esto puede tardar unos segundos…" />
              </SectionCard>
            )}

            {excelMode && step === 1 && excelStep === "pick_sheet" && (
              <SectionCard title="Elegí la hoja" description={excelFileName}>
                {excelSheets.length === 0 ? (
                  <EmptyState bordered={false} icon={FileSpreadsheet} title="No encontramos hojas con datos en este archivo." />
                ) : (
                  <div className="space-y-1.5 max-h-80 overflow-y-auto pr-1">
                    {excelSheets.map((s) => (
                      <button
                        key={s.sheet_name}
                        onClick={() => handleExcelSheetPicked(s)}
                        className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-border hover:border-foreground/30 hover:bg-surface transition-colors text-left"
                      >
                        <span className="text-sm">{s.sheet_name}</span>
                        <ChevronRight size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                      </button>
                    ))}
                  </div>
                )}
                <div className="mt-4">
                  <Button variant="ghost" onClick={cancelExcelUpload}>
                    Cancelar
                  </Button>
                </div>
              </SectionCard>
            )}

            {!excelMode && loadingEditConnection && <LoadingState variant="centered" className="py-16" />}

            {!excelMode && !loadingEditConnection && step === 1 && (() => {
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
                                setFieldMappings({});
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

            {!excelMode && !loadingEditConnection && step === 2 && (() => {
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
                                // Bug real encontrado en vivo 2026-08-29: elegir acá una
                                // planilla+hoja que YA tiene una conexión guardada (de
                                // cualquier cuenta, no solo la que se está navegando)
                                // disparaba el análisis de IA de nuevo y generaba
                                // field_keys distintos a los ya guardados — si el
                                // usuario guardaba, quedaba una conexión duplicada a la
                                // misma hoja. Si hay match, se abre directamente en modo
                                // "Editar" esa conexión existente en vez de tratarla
                                // como nueva.
                                const existing = selectedSpreadsheetId
                                  ? connections.find(
                                      (c) => c.spreadsheet_id === selectedSpreadsheetId && c.sheet_name === t
                                    )
                                  : undefined;
                                if (existing) {
                                  toast.message("Ya tenías esta hoja conectada — abrimos su mapeo para editar.");
                                  openEditConnection(existing);
                                  return;
                                }
                                setSelectedSheetName(t);
                                setStep(3);
                                if (wizardAccountId && selectedSpreadsheetId) loadHeaders(wizardAccountId, selectedSpreadsheetId, t);
                              }}
                              className="w-full flex items-center justify-between gap-3 px-4 py-3 rounded-md border border-border hover:border-foreground/30 hover:bg-surface transition-colors text-left"
                            >
                              <span className="flex items-center gap-2 text-sm min-w-0">
                                <span className="truncate">{t}</span>
                                {selectedSpreadsheetId &&
                                  connections.some(
                                    (c) => c.spreadsheet_id === selectedSpreadsheetId && c.sheet_name === t
                                  ) && (
                                    <Badge variant="secondary" className="shrink-0">
                                      Ya conectada
                                    </Badge>
                                  )}
                              </span>
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
              <SectionCard title="Reconociendo tu planilla" description={`${selectedSpreadsheetName} · ${selectedSheetName}`}>
                {(classifying || analyzingSheet || extractingLayout) && (
                  <LoadingState
                    variant="inline"
                    label={classifying ? "Identificando qué tipo de datos es esto…" : "Analizando con IA para sugerir el mapeo…"}
                    className="mb-3"
                  />
                )}
                {!classifying && sampleRows.length > 0 && (
                  <div className="border border-border rounded-md p-3 mb-4">
                    <p className="text-xs font-medium mb-2 flex items-center gap-1.5">
                      <Sparkles size={12} strokeWidth={1.5} className="text-muted-foreground" />
                      Vista previa de tus datos
                    </p>
                    {classification && (
                      <p className="text-xs text-muted-foreground mb-2">
                        Parece ser un <span className="font-medium text-foreground">{SPREADSHEET_TYPE_LABELS[classification.spreadsheet_type] ?? classification.spreadsheet_type}</span>
                        {classification.row_semantics && <>: {classification.row_semantics}</>}
                      </p>
                    )}
                    <div className="mb-2">
                      <label className="text-xs font-medium block mb-1">Cómo leer esta hoja</label>
                      <Select value={effectiveLayout} onValueChange={(v) => handleLayoutOverride(v as SheetLayout)}>
                        <SelectTrigger className="h-8 w-full sm:w-72 text-xs" aria-label="Mecanismo de mapeo">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          <SelectItem value="row_based">Fila por período (una columna marca el mes)</SelectItem>
                          <SelectItem value="grid">Cuadrícula (meses en columnas o en filas, ej. estado de resultados)</SelectItem>
                          <SelectItem value="eav">Vertical (una columna de fecha, una de nombre de métrica, una de valor)</SelectItem>
                        </SelectContent>
                      </Select>
                      <p className="text-[11px] text-tertiary mt-1">
                        {sheetLayout !== "row_based" ? "Sugerido automáticamente — cambialo si no es correcto." : "Podés cambiarlo si tu hoja no es una fila por período."}
                      </p>
                    </div>
                    <div className="overflow-x-auto -mx-1">
                      <table className="text-[11px] font-mono border-collapse min-w-full">
                        <thead>
                          <tr>
                            {headers.map((h) => (
                              <th key={h} className="px-1.5 py-1 text-left text-muted-foreground border-b border-border whitespace-nowrap">
                                {h}
                              </th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {sampleRows.slice(0, 4).map((row, i) => (
                            <tr key={i}>
                              {headers.map((_, ci) => (
                                <td key={ci} className="px-1.5 py-1 border-b border-border/50 whitespace-nowrap">
                                  {row[ci] ?? ""}
                                </td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                )}
                {!classifying && classification?.spreadsheet_type === "entity_table" && (
                  <div className="border border-warning/40 bg-warning/10 rounded-md p-3 mb-4 text-xs" aria-live="polite">
                    <p className="font-medium flex items-center gap-1.5">
                      <AlertTriangle size={12} strokeWidth={1.5} />
                      Todavía no podemos mapear este tipo de hoja automáticamente
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      Parece una lista de entidades (ej. clientes), donde cada fila no tiene un período — no
                      encaja en el mapeo de siempre. Por ahora no hay una forma automática de cargar esto. Probá con
                      otra hoja, o subí esta más adelante cuando lo soportemos.
                    </p>
                  </div>
                )}
                <FormActions
                  onCancel={excelMode ? cancelExcelUpload : () => setStep(2)}
                  cancelLabel={excelMode ? "Cancelar" : "Atrás"}
                  onSubmit={() => setStep(4)}
                  submitLabel="Continuar"
                  disabled={classifying || analyzingSheet || extractingLayout || classification?.spreadsheet_type === "entity_table"}
                />
              </SectionCard>
            )}

            {!loadingEditConnection && step === 4 && (
              <SectionCard
                title="Mapeá las columnas"
                description={
                  headers.length > 0
                    ? `${selectedSpreadsheetName} · ${selectedSheetName} · ${usedColumnsCount} de ${headers.length} columnas usadas`
                    : `${selectedSpreadsheetName} · ${selectedSheetName}`
                }
              >
                {!loadingHeaders && headers.length > 0 && (
                  <p className="text-xs text-muted-foreground mb-3">
                    Elegí qué columna marca el período. Para las demás, decidí cuáles traer y cómo se van a llamar:
                    solo lectura de datos acá, nada de sumar ni filtrar, eso se define después con fórmulas en la
                    sección de Métricas (por ejemplo <code className="font-mono">FIELDSUM("monto")</code>).
                  </p>
                )}
                {aiEnrichmentFailed && (
                  <div className="border border-warning/40 bg-warning/10 rounded-md p-3 mb-4 text-xs" aria-live="polite">
                    <p className="font-medium">No pudimos generar la sugerencia de IA para esta hoja.</p>
                    <p className="text-muted-foreground mt-0.5">
                      Los nombres de campo se completaron igual, pero el tipo de dato de cada columna no se revisó
                      automáticamente — confirmá que cada una diga "Texto" o "Número" correctamente antes de guardar.
                    </p>
                  </div>
                )}
                {duplicateHeaders.length > 0 && (
                  <div className="border border-destructive/40 bg-destructive/5 rounded-md p-3 mb-4 text-xs" aria-live="polite">
                    <p className="font-medium text-destructive">
                      Esta hoja tiene columnas con el mismo nombre repetido: {duplicateHeaders.join(", ")}
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      No podemos distinguir cuál es cuál — si guardás así, se pierden los datos de una de las dos.
                      Renombrá las columnas repetidas en el archivo (ej. "Monto" y "Monto 2") y subilo de nuevo.
                    </p>
                  </div>
                )}
                {staleHeaders.length > 0 && (
                  <div className="border border-warning/40 bg-warning/10 rounded-md p-3 mb-4 text-xs" aria-live="polite">
                    <p className="font-medium">Estas columnas del mapeo guardado ya no están en la hoja:</p>
                    <p className="text-muted-foreground mt-0.5">{staleHeaders.join(", ")}</p>
                  </div>
                )}
                {duplicateFieldKeys.length > 0 && (
                  <div className="border border-destructive/40 bg-destructive/5 rounded-md p-3 mb-4 text-xs" aria-live="polite">
                    <p className="font-medium text-destructive">Hay nombres de campo repetidos: {duplicateFieldKeys.join(", ")}</p>
                    <p className="text-muted-foreground mt-0.5">Cada campo tiene que tener un nombre único.</p>
                  </div>
                )}
                {crossConnectionDuplicateKeys.length > 0 && (
                  <div className="border border-destructive/40 bg-destructive/5 rounded-md p-3 mb-4 text-xs" aria-live="polite">
                    <p className="font-medium text-destructive">
                      Ya se usa{crossConnectionDuplicateKeys.length === 1 ? "" : "n"} en otra hoja conectada:{" "}
                      {crossConnectionDuplicateKeys.join(", ")}
                    </p>
                    <p className="text-muted-foreground mt-0.5">
                      Elegí un nombre distinto para ese campo acá (ej. "{crossConnectionDuplicateKeys[0]}_ventas") para
                      poder guardar. Si tuvieran el mismo nombre, sus valores se sumarían entre sí sin que nadie lo note.
                    </p>
                  </div>
                )}
                {loadingHeaders ? (
                  <LoadingState />
                ) : headers.length === 0 ? (
                  <EmptyState bordered={false} icon={FileSpreadsheet} title="Esta hoja no tiene columnas en la primera fila." />
                ) : effectiveLayout === "grid" ? (
                  extractingLayout ? (
                    <LoadingState variant="inline" label="Entendiendo la estructura de la hoja…" />
                  ) : layoutExtraction?.layout === "grid" ? (
                    <GridLayoutMapping
                      periodOrientation={layoutExtraction.period_orientation}
                      periodAxis={layoutExtraction.period_axis}
                      conceptAxis={gridConceptAxis}
                      onChange={setGridConceptAxis}
                    />
                  ) : (
                    <EmptyState bordered={false} icon={AlertTriangle} title="No pudimos entender esta hoja como cuadrícula." description="Probá con 'Vertical' o 'Fila por período' arriba." />
                  )
                ) : effectiveLayout === "eav" ? (
                  extractingLayout ? (
                    <LoadingState variant="inline" label="Entendiendo la estructura de la hoja…" />
                  ) : layoutExtraction?.layout === "eav" ? (
                    <EavLayoutMapping
                      periodColumn={layoutExtraction.eav_period_column}
                      metricNameColumn={layoutExtraction.eav_metric_name_column}
                      valueColumn={layoutExtraction.eav_value_column}
                      metricMapping={eavMetricMapping}
                      onChange={setEavMetricMapping}
                    />
                  ) : (
                    <EmptyState bordered={false} icon={AlertTriangle} title="No pudimos entender esta hoja como formato vertical." description="Probá con 'Cuadrícula' o 'Fila por período' arriba." />
                  )
                ) : (
                  <div className="space-y-5">
                    <div>
                      <label className="text-xs font-medium block mb-1.5">Columna de período (mes)</label>
                      <div className="max-w-xs">
                        <HeaderCombobox
                          headers={headers}
                          value={periodColumn}
                          onChange={(v) => {
                            setPeriodColumn(v);
                            setFieldMappings((prev) => {
                              if (!prev[v]) return prev;
                              const next = { ...prev };
                              delete next[v];
                              return next;
                            });
                          }}
                          placeholder="Elegí una columna…"
                          ariaLabel="Columna de período"
                        />
                      </div>
                      {periodColumnLooksWrong(periodColumn, headers, sampleRows) && (
                        <p className="text-xs text-warning mt-1.5 flex items-start gap-1.5" aria-live="polite">
                          <AlertTriangle size={12} strokeWidth={1.5} className="shrink-0 mt-0.5" />
                          Los valores de "{periodColumn}" no parecen fechas — revisá que sea realmente la columna que
                          marca el mes de cada fila. Si tu archivo tiene los meses como columnas en vez de como
                          filas, probá "Cuadrícula" arriba en vez de "Fila por período".
                        </p>
                      )}
                    </div>

                    <div>
                      <label className="text-xs font-medium block mb-1.5">Columnas a traer</label>
                      <div className="space-y-1.5">
                        {headers
                          .filter((h) => h !== periodColumn)
                          .map((header) => (
                            <FieldMappingRow
                              key={header}
                              header={header}
                              mapping={fieldMappings[header] ?? null}
                              onChange={(next) =>
                                setFieldMappings((prev) => ({ ...prev, [header]: next }))
                              }
                              onRemove={() =>
                                setFieldMappings((prev) => {
                                  const next = { ...prev };
                                  delete next[header];
                                  return next;
                                })
                              }
                            />
                          ))}
                      </div>
                    </div>
                  </div>
                )}
                {!loadingHeaders && headers.length > 0 && effectiveLayout === "row_based" && (
                  <p className="text-xs text-muted-foreground pt-3">
                    {duplicateHeaders.length > 0
                      ? "Renombrá las columnas repetidas en el archivo antes de guardar."
                      : !periodColumn
                        ? "Falta elegir la columna de período (mes)."
                        : usedColumnsCount === 0
                          ? "Elegí al menos una columna para traer."
                          : !allMappingsValid
                            ? "Hay columnas sin nombre de campo."
                            : duplicateFieldKeys.length > 0
                              ? "Hay nombres de campo repetidos: dejá cada uno una sola vez."
                              : "Listo para guardar."}
                  </p>
                )}
                {duplicateConnectionId && (
                  <div className="border border-warning/40 bg-warning/10 rounded-md p-3 mb-4 text-xs" aria-live="polite">
                    <p className="font-medium">Ya tenías esta hoja conectada</p>
                    <p className="text-muted-foreground mt-0.5">
                      Otra conexión activa ya mapea la misma hoja y pestaña. Editá esa conexión en vez de crear una duplicada.
                    </p>
                  </div>
                )}
                <FormActions
                  className="mt-4"
                  onCancel={excelMode ? cancelExcelUpload : editingConnectionId ? cancelWizard : () => setStep(3)}
                  cancelLabel={excelMode ? "Cancelar" : editingConnectionId ? "Cancelar" : "Atrás"}
                  onSubmit={handleSaveMapping}
                  submitLabel="Guardar mapeo"
                  busy={savingMapping}
                  disabled={headers.length === 0 || !canSaveMapping}
                  extra={
                    excelMode || editingConnectionId ? undefined : (
                      <Button variant="ghost" onClick={cancelWizard}>
                        Cancelar
                      </Button>
                    )
                  }
                />
              </SectionCard>
            )}

            {step === 5 && (
              <SectionCard
                title="Revisá las métricas sugeridas"
                description="La IA propuso esto a partir de tus datos. Nada se crea todavía."
              >
                <SuggestedMetricsReview
                  suggestions={suggestedMetrics}
                  needingMoreData={metricsNeedingMoreData}
                  companyId={company_id}
                  allMetrics={financial.metrics}
                  categories={metricCategories}
                  defaultCategory={metricCategories[0]?.id ?? "revenue"}
                  onSaved={financial.reload}
                  onDone={cancelWizard}
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
            ? confirmRemoveConnection.field_mappings === null
              ? `Se deja de sincronizar "${confirmRemoveConnection.spreadsheet_name} · ${confirmRemoveConnection.sheet_name}". Sus campos crudos dejan de estar disponibles: cualquier fórmula que los use (FIELDSUM, etc.) va a dejar de calcular hasta que mapees la hoja de nuevo. No afecta la cuenta de Google ni tus otras conexiones.`
              : `Se deja de sincronizar "${confirmRemoveConnection.spreadsheet_name} · ${confirmRemoveConnection.sheet_name}". Sus ${confirmRemoveConnection.field_mappings.length} campo${confirmRemoveConnection.field_mappings.length === 1 ? "" : "s"} crudo${confirmRemoveConnection.field_mappings.length === 1 ? "" : "s"} deja${confirmRemoveConnection.field_mappings.length === 1 ? "" : "n"} de estar disponibles: cualquier fórmula que los use (FIELDSUM, etc.) va a dejar de calcular hasta que mapees el campo de nuevo. No afecta la cuenta de Google ni tus otras conexiones.`
            : ""
        }
        confirmLabel="Quitar hoja"
        variant="destructive"
        busy={!!removingConnectionId}
        onConfirm={handleRemoveConnection}
      />

      <ConfirmationDialog
        open={!!pendingBreakingChange}
        onOpenChange={(o) => !o && setPendingBreakingChange(null)}
        title="Este cambio puede romper métricas existentes"
        description={
          pendingBreakingChange
            ? `Estás por sacar o cambiar el tipo de una columna que ${pendingBreakingChange.length === 1 ? "esta métrica ya usa" : "estas métricas ya usan"} para calcularse: ${pendingBreakingChange.map((m) => m.name).join(", ")}. Si guardás, ${pendingBreakingChange.length === 1 ? "va a dejar" : "van a dejar"} de calcular hasta que corrijas su fórmula o vuelvas a mapear la columna.`
            : ""
        }
        confirmLabel="Guardar de todas formas"
        variant="destructive"
        busy={savingMapping}
        onConfirm={doSaveMapping}
      />

      {entityResolutionConnection && company_id && (
        <EntityResolutionDialog
          open={!!entityResolutionConnection}
          onOpenChange={(o) => !o && setEntityResolutionConnection(null)}
          companyId={company_id}
          connectionId={entityResolutionConnection.connection_id}
          fields={entityResolutionConnection.field_mappings ?? []}
          onResolved={loadConnections}
        />
      )}

      <EntityAliasesDialog open={entityAliasesOpen} onOpenChange={setEntityAliasesOpen} companyId={company_id ?? null} />

      {duplicatesConnection && company_id && (
        <DuplicateTransactionsDialog
          open={!!duplicatesConnection}
          onOpenChange={(o) => !o && setDuplicatesConnection(null)}
          companyId={company_id}
          connectionId={duplicatesConnection.connection_id}
          connectionLabel={`${duplicatesConnection.spreadsheet_name} · ${duplicatesConnection.sheet_name}`}
        />
      )}

    </AppLayout>
  );
}

// Rail de pasos del wizard — reemplaza el breadcrumb plano de texto viejo.
// current es 1-indexado sobre `labels` (ver EXCEL_STEP_INDEX/SHEETS_STEP_LABELS
// más arriba para cómo se traduce desde el WizardStep real).
function StepRail({ labels, current }: { labels: string[]; current: number }) {
  return (
    <div className="flex items-center mb-4" role="list" aria-label="Pasos">
      {labels.map((label, i) => {
        const n = i + 1;
        const state = n === current ? "active" : n < current ? "done" : "pending";
        return (
          <div key={label} className={cn("flex items-center", i < labels.length - 1 && "flex-1")} role="listitem">
            <div className="flex items-center gap-1.5 shrink-0">
              <span
                className={cn(
                  "w-5 h-5 rounded-full border flex items-center justify-center text-[10px] font-medium shrink-0",
                  state === "active" && "bg-primary border-primary text-primary-foreground",
                  state === "done" && "bg-foreground border-foreground text-background",
                  state === "pending" && "border-border text-tertiary"
                )}
              >
                {state === "done" ? <Check size={11} strokeWidth={2.5} /> : n}
              </span>
              <span
                className={cn(
                  "text-xs whitespace-nowrap",
                  state === "pending" ? "text-tertiary" : "text-foreground",
                  state === "active" && "font-medium"
                )}
              >
                {label}
              </span>
            </div>
            {i < labels.length - 1 && (
              <div className={cn("h-px mx-2.5 flex-1 min-w-4", n < current ? "bg-foreground" : "bg-border")} />
            )}
          </div>
        );
      })}
    </div>
  );
}

// Panel inline (no un wizard aparte) para asignar el rol de la fuente y
// configurar la sincronización de UNA conexión — "source_of_truth" nunca lo
// sugiere la IA (classify-workbook), es siempre una decisión manual del
// founder. Excel solo admite sync_mode "manual"/"snapshot" (no tiene API en
// vivo) — el selector se acota directo acá en vez de dejar que el usuario
// elija algo que el backend va a rechazar.
function ConnectionSettingsPanel({
  connection,
  savingDataRole,
  savingSyncSettings,
  onSetDataRole,
  onSetSyncSettings,
}: {
  connection: SheetConnection;
  savingDataRole: boolean;
  savingSyncSettings: boolean;
  onSetDataRole: (role: DataRole | null) => void;
  onSetSyncSettings: (settings: { sync_mode?: SyncMode | null; sync_frequency?: SyncFrequency | null }) => void;
}) {
  const isExcel = connection.source === "excel";
  const syncModeOptions: SyncMode[] = isExcel ? ["manual", "snapshot"] : ["live", "scheduled", "event_based", "manual", "snapshot"];
  return (
    <div className="border-t border-border mt-3 pt-3 grid sm:grid-cols-2 gap-4">
      <div>
        <label className="text-xs font-medium block mb-1.5">Rol de esta fuente</label>
        <Select
          value={connection.data_role ?? "__none__"}
          onValueChange={(v) => onSetDataRole(v === "__none__" ? null : (v as DataRole))}
          disabled={savingDataRole}
        >
          <SelectTrigger className="h-8 text-xs" aria-label="Rol de la fuente">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">Sin asignar</SelectItem>
            {(Object.keys(DATA_ROLE_LABELS) as DataRole[]).map((role) => (
              <SelectItem key={role} value={role}>
                {DATA_ROLE_LABELS[role]}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          Solo importa si vas a conectar otra fuente que mida lo mismo. Si en algún momento no coinciden, la marcada
          "Fuente de verdad" es la que gana.
        </p>
      </div>
      <div>
        <label className="text-xs font-medium block mb-1.5">Sincronización</label>
        <div className="flex gap-2">
          <Select
            value={connection.sync_mode}
            onValueChange={(v) => onSetSyncSettings({ sync_mode: v as SyncMode })}
            disabled={savingSyncSettings}
          >
            <SelectTrigger className="h-8 text-xs flex-1" aria-label="Modo de sincronización">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {syncModeOptions.map((mode) => (
                <SelectItem key={mode} value={mode}>
                  {SYNC_MODE_LABELS[mode]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select
            value={connection.sync_frequency ?? "manual"}
            onValueChange={(v) => onSetSyncSettings({ sync_frequency: v as SyncFrequency })}
            disabled={savingSyncSettings || isExcel}
          >
            <SelectTrigger className="h-8 text-xs flex-1" aria-label="Frecuencia de sincronización">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {(Object.keys(SYNC_FREQUENCY_LABELS) as SyncFrequency[]).map((freq) => (
                <SelectItem key={freq} value={freq}>
                  {SYNC_FREQUENCY_LABELS[freq]}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
        <p className="text-[11px] text-muted-foreground mt-1.5">
          {connection.next_sync_at
            ? `Próxima sincronización automática: ${new Date(connection.next_sync_at).toLocaleString("es-AR")}. Podés apretar "Sincronizar" cuando quieras igual.`
            : "Define cada cuánto buscamos datos nuevos sin que hagas nada. Podés apretar \"Sincronizar\" a mano en cualquier momento."}
        </p>
      </div>
    </div>
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

// Una fila por columna de la hoja (menos la de período, que se elige
// aparte arriba): usarla o no, y si se usa, cómo se llama el campo y de qué
// tipo es. Nada de agregación ni filtros acá a propósito — ver el comentario
// arriba de DraftFieldMapping.
function FieldMappingRow({
  header,
  mapping,
  onChange,
  onRemove,
}: {
  header: string;
  mapping: DraftFieldMapping | null;
  onChange: (next: DraftFieldMapping) => void;
  onRemove: () => void;
}) {
  const used = !!mapping;
  // "Editado": el usuario cambió el texto respecto a lo sembrado (generado
  // por IA en un guardado anterior, o ya editado antes — el backend no
  // distingue entre esos dos casos, así que acá tampoco). "Generada": tiene
  // contenido y coincide con lo sembrado, sin tocar en esta sesión. Vacía:
  // todavía no existe, se genera con IA al guardar.
  const descriptionState =
    used && mapping
      ? mapping.description.trim() === ""
        ? "empty"
        : mapping.description !== mapping.originalDescription
          ? "edited"
          : "generated"
      : "empty";
  return (
    <div className="py-1.5 border-b border-border/50 last:border-0">
      <div className="flex items-center gap-3">
        <label className="flex items-center gap-2 flex-1 min-w-0 cursor-pointer">
          <Checkbox
            checked={used}
            onCheckedChange={(c) => {
              if (c === true)
                onChange({
                  column: header,
                  field_key: slugifyFieldKey(header),
                  value_type: "number",
                  description: "",
                  originalDescription: "",
                });
              else onRemove();
            }}
            aria-label={`Usar la columna ${header}`}
          />
          <span className="text-sm font-mono truncate">{header}</span>
        </label>
        {used && mapping && (
          <>
            <Input
              value={mapping.field_key}
              onChange={(e) => onChange({ ...mapping, field_key: e.target.value })}
              placeholder="nombre_del_campo"
              aria-label={`Nombre del campo para la columna ${header}`}
              className="h-8 text-xs font-mono w-40 shrink-0"
            />
            <Select
              value={mapping.value_type}
              onValueChange={(v: "number" | "text") => onChange({ ...mapping, value_type: v })}
            >
              <SelectTrigger className="h-8 w-28 shrink-0 text-xs" aria-label={`Tipo de dato para ${header}`}>
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="number">Número</SelectItem>
                <SelectItem value="text">Texto</SelectItem>
              </SelectContent>
            </Select>
          </>
        )}
      </div>
      {used && mapping && (
        <div className="flex items-center gap-2 mt-1.5 pl-6">
          <Input
            value={mapping.description}
            onChange={(e) => onChange({ ...mapping, description: e.target.value })}
            placeholder="Qué significa este campo: se genera automáticamente al guardar si lo dejás vacío"
            aria-label={`Descripción del campo para la columna ${header}`}
            className="h-7 text-xs flex-1 min-w-0"
          />
          {descriptionState === "edited" && (
            <Badge variant="secondary" className="shrink-0 text-[10px]">
              Editado
            </Badge>
          )}
          {descriptionState === "generated" && (
            <Badge variant="outline" className="shrink-0 text-[10px] text-muted-foreground">
              Generada
            </Badge>
          )}
        </div>
      )}
    </div>
  );
}
