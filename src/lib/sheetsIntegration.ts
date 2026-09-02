import { API_BASE_URL } from "@/lib/apiConfig";
import type { Confidence } from "@/lib/financialData";

export const LIST_GOOGLE_ACCOUNTS_URL = `${API_BASE_URL}/list-google-accounts`;
export const CONNECT_SHEETS_URL = `${API_BASE_URL}/connect-sheets`;
export const LIST_SHEETS_URL = `${API_BASE_URL}/list-sheets`;
export const GET_SHEET_TABS_URL = `${API_BASE_URL}/get-sheet-tabs`;
export const GET_SHEET_HEADERS_URL = `${API_BASE_URL}/get-sheet-headers`;
export const SAVE_SHEET_MAPPING_URL = `${API_BASE_URL}/save-sheet-mapping`;
export const LIST_SHEET_CONNECTIONS_URL = `${API_BASE_URL}/list-sheet-connections`;
export const REMOVE_SHEET_CONNECTION_URL = `${API_BASE_URL}/remove-sheet-connection`;
export const SYNC_SHEETS_URL = `${API_BASE_URL}/sync-sheets`;
export const DISCONNECT_SHEETS_URL = `${API_BASE_URL}/disconnect-sheets`;
// Metrics AI-native (2026-08-30) — subida de Excel como fuente de datos,
// alternativa a Google Sheets. Flujo de 2 pasos client-side: el archivo se
// sube directo a GCS con una signed URL, nunca pasa por una Cloud Function.
export const REQUEST_WORKBOOK_UPLOAD_URL = `${API_BASE_URL}/request-workbook-upload-url`;
export const CONFIRM_WORKBOOK_UPLOAD_URL = `${API_BASE_URL}/confirm-workbook-upload`;
export const GET_UPLOAD_STATUS_URL = `${API_BASE_URL}/get-upload-status`;
export const DELETE_WORKBOOK_UPLOAD_URL = `${API_BASE_URL}/delete-workbook-upload`;
// Clasificación automática de tipo de spreadsheet + rol de la fuente (source
// of truth/operational input/etc.) y configuración de sync — todo nuevo,
// mismo lanzamiento.
export const CLASSIFY_WORKBOOK_URL = `${API_BASE_URL}/classify-workbook`;
// Contrato 2026-08-31 — cuando classify-workbook detecta layout "grid"/"eav"
// (una hoja con período en columnas/filas tipo estado de resultados, o en
// formato vertical fecha/métrica/valor) este endpoint reemplaza a
// analyze-transactional-sheet para esa hoja puntual. Nunca trae los valores
// numéricos de la hoja (solo posiciones/nombres) — el preview real se arma
// leyendo sample_rows que el frontend ya tiene cargado.
export const EXTRACT_SHEET_LAYOUT_URL = `${API_BASE_URL}/extract-sheet-layout`;
// Contrato 2026-08-31 — URL firmada de LECTURA (a diferencia de
// request-workbook-upload-url, que es de escritura) para ver/descargar el
// archivo Excel original ya subido a una conexión. Solo aplica a
// source: "excel" — las conexiones de Sheets no tienen archivo, se leen en
// vivo. Expira en 60 min, pedirla recién al hacer click, nunca cachearla.
export const GET_WORKBOOK_DOWNLOAD_URL = `${API_BASE_URL}/get-workbook-download-url`;
export const SET_CONNECTION_DATA_ROLE_URL = `${API_BASE_URL}/set-connection-data-role`;
export const SET_CONNECTION_SYNC_SETTINGS_URL = `${API_BASE_URL}/set-connection-sync-settings`;

export const EXCEL_CONTENT_TYPE = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";

export type DataRole = "source_of_truth" | "operational_input" | "financial_model" | "historical_snapshot" | "report_export";
export type SyncMode = "live" | "scheduled" | "event_based" | "manual" | "snapshot";
export type SyncFrequency = "every_15_min" | "hourly" | "every_6_hours" | "daily" | "weekly" | "monthly" | "manual";
export type SpreadsheetType =
  | "time_series"
  | "transaction_ledger"
  | "entity_table"
  | "financial_model"
  | "historical_snapshot"
  | "report_export";
// Datos crudos: listado de campos disponibles (autocomplete de fórmulas) y
// consulta agregada bajo demanda — reemplazan el modelo viejo de
// agregación/filtros configurados en la conexión, ver formulaEngine.ts.
export const LIST_RAW_FIELDS_URL = `${API_BASE_URL}/list-raw-fields`;
// Batch: una query por FIELDSUM/FIELDCOUNT/etc. referenciado, para todos los
// períodos que hagan falta, en un solo request. results[i] corresponde a
// queries[i] por orden (la respuesta no repite filters/distinct_field_key,
// así que no hay otra forma de emparejar cuando dos queries comparten
// field_key+aggregation+period con filtros distintos).
export const QUERY_RAW_FIELDS_URL = `${API_BASE_URL}/query-raw-fields`;

// A company can have several Google accounts connected (each its own OAuth
// grant) — replaces the old singular get-sheets-status.
export type GoogleAccount = {
  account_id: string;
  google_account_email: string;
  // Si Google revocó el token de ESTA cuenta puntual — por cuenta, a
  // diferencia de source_enabled más abajo.
  reconnect_required: boolean;
  connected_at: string;
};

// GET /list-google-accounts?company_id=... response shape. source_enabled
// vive a nivel raíz (no por cuenta): es un toggle de company entero
// (assign-source, un admin de CloudValley lo prende/apaga) — por eso llega
// incluso cuando accounts está vacío, así se puede distinguir "todavía no
// conectaste nada" de "está pausado, no podés conectar" antes de la primera
// conexión. Acá no hay nada que el founder pueda hacer, hace falta que un
// admin la reactive.
export type GoogleAccountsResponse = {
  source_enabled: boolean;
  accounts: GoogleAccount[];
};

// modified_time (2026-08-30): ISO 8601 de Drive, o null. Sin esto una company
// ve TODAS sus planillas personales sin relación mezcladas sin ranking — con
// order_by=modified_time (ver LIST_SHEETS_URL) se puede ordenar por más
// reciente como proxy barato de relevancia mientras no exista clasificación
// real de la company (ver classify-workbook).
export type SheetSummary = { spreadsheet_id: string; name: string; modified_time?: string | null };

// Una columna de la planilla mapeada a un campo crudo propio de ESTA
// conexión — nada de agregación ni filtros acá (eso vive en las fórmulas de
// Métricas, ver formulaEngine.ts). field_key es un namespace propio de la
// conexión: no tiene que coincidir con ningún input_key del catálogo de
// métricas, es libre (snake_case).
export type FieldMapping = {
  column: string;
  field_key: string;
  value_type: "number" | "text";
  // Generada por IA a partir de una muestra de la columna, o editada a mano
  // por el founder (ver SaveSheetMappingResponse) — nunca se sobrescribe una
  // que ya llegó con contenido, ni parcial ni totalmente. Ausente/vacía en
  // el request → el backend la genera; si falla (modelo caído, rate limit)
  // el mapeo se guarda igual, queda null hasta el próximo guardado.
  description?: string | null;
};

// Solo distinto de null cuando source="excel" — la ingesta de TODAS las
// filas corre síncronamente dentro del mismo request de save-sheet-mapping
// (puede tardar más que antes con archivos grandes). Para source="sheet"
// sigue siendo null, el sync real lo dispara sync-sheets aparte.
export type IngestResult = {
  status: "success" | "partial_success" | "error";
  rows_processed: number;
  rows_rejected: number;
  row_errors: unknown[];
};

// ---- save-sheet-mapping: campos comunes a los 3 modos, más los propios de
// "grid"/"eav" (2026-08-31) — structure ausente/"tabular" es el contrato de
// siempre, retrocompatible sin cambios. ----
type SaveSheetMappingCommon = {
  company_id: string;
  source: "sheet" | "excel";
  sheet_name: string;
  connection_id?: string;
  upload_id?: string;
  account_id?: string;
  spreadsheet_id?: string;
  spreadsheet_name?: string;
};
export type SaveSheetMappingTabularRequest = SaveSheetMappingCommon & {
  structure?: "tabular";
  period_column: string;
  field_mappings: FieldMapping[];
};
export type SaveSheetMappingGridRequest = SaveSheetMappingCommon & {
  structure: "grid";
  period_orientation: "columns" | "rows";
  period_axis: PeriodAxisEntry[];
  concept_axis: ConceptAxisEntry[];
};
export type SaveSheetMappingEavRequest = SaveSheetMappingCommon & {
  structure: "eav";
  eav_period_column: string;
  eav_metric_name_column: string;
  eav_value_column: string;
  eav_metric_mapping: EavMetricMapping[];
};
export type SaveSheetMappingRequest = SaveSheetMappingTabularRequest | SaveSheetMappingGridRequest | SaveSheetMappingEavRequest;

// field_mappings viene null para structure "grid"/"eav" (sin descripciones
// generadas por IA en esta pasada, a diferencia del modo tabular).
// save-sheet-mapping ahora también devuelve field_mappings (antes solo
// {success, connection_id}) — cada uno con su description ya resuelta
// (generada o la que mandó el founder), para poder mostrarla sin un
// segundo request. 2026-08-11. ingest_result: contrato 2026-08-30 (ver
// arriba). field_mappings viene null para structure "grid"/"eav" (contrato
// 2026-08-31, sin descripciones generadas por IA en esta pasada).
export type SaveSheetMappingResponse = {
  success: boolean;
  connection_id: string;
  field_mappings: FieldMapping[] | null;
  ingest_result: IngestResult | null;
};

// One spreadsheet+sheet (o, desde 2026-08-30, un workbook Excel subido)
// mapped to raw fields. A company can have several of these active at once,
// across one or more accounts/uploads — replaces the old singular
// get-sheet-mapping.
export type SheetConnection = {
  connection_id: string;
  // "excel" ausente en Firestore se normaliza a "sheet" — conexiones de
  // antes de este campo (2026-08-30) son siempre "sheet".
  source: "sheet" | "excel";
  account_id: string | null;
  google_account_email: string | null; // denormalizado; null cuando source="excel"
  spreadsheet_id: string | null; // null cuando source="excel"
  upload_id: string | null; // solo cuando source="excel"
  spreadsheet_name: string;
  sheet_name: string;
  period_column: string;
  // null para conexiones structure="grid"/"eav" (contrato 2026-08-31) — el
  // tipo decía FieldMapping[] a secas hasta que un crash real en vivo
  // (2026-09-01, primera vez que se guardó una conexión eav de verdad)
  // confirmó que backend sí devuelve null acá, no solo en la respuesta de
  // save-sheet-mapping. Ver fieldCountLabel en GrowthTrackerSheets.tsx.
  field_mappings: FieldMapping[] | null;
  last_synced_at: string | null;
  last_sync_status: string | null;
  created_at: string;
  // Todo lo de acá abajo es contrato 2026-08-30 — ausente/null en
  // conexiones creadas antes de esta feature, comportamiento esperado, no
  // un dato faltante por error.
  data_role: DataRole | null;
  sync_mode: SyncMode;
  sync_frequency: SyncFrequency | null;
  next_sync_at: string | null;
  freshness_sla: string | null;
};

// field_mappings viene null para conexiones structure="grid"/"eav"
// (contrato 2026-08-31) — bug real encontrado en vivo 2026-09-01: 4 lugares
// (GrowthTrackerSheets.tsx x3, MetricsDataSourcesTab.tsx x1) asumían que
// siempre era un array y rompían toda la página (crash de React, pantalla
// en blanco) al leer .length de null la primera vez que se guardó una
// conexión grid/eav real de verdad (hasta entonces nunca había pasado).
// tsc no lo atrapó porque este proyecto tiene "strict": false — no hay
// protección de null en ningún lado del código, revisión manual es la única
// defensa real.
export function fieldCountLabel(fieldMappings: FieldMapping[] | null): string {
  if (fieldMappings === null) return "mapeo avanzado";
  return `${fieldMappings.length} campo${fieldMappings.length === 1 ? "" : "s"}`;
}

export type SyncRowError = { field: string; reason: string; row?: number; period?: string };

export type SyncResult = {
  status: string;
  // Presente cuando status: "error" por la fuente pausada — ver source_disabled.
  reason?: string;
  // Presente cuando el sync fue de una conexión puntual (siempre lo es en la
  // práctica: incluso sync-sheets sin connection_id devuelve un array de
  // estos, uno por conexión).
  connection_id?: string;
  import_log_id: string | null;
  rows_processed: number;
  rows_rejected: number;
  row_errors: SyncRowError[];
  // Contrato 2026-08-30 — delta real de esta corrida, no solo "sincronizado
  // con éxito". changed_formulas siempre 0 en la práctica hoy (el pipeline
  // no captura fórmulas crudas, solo valores ya resueltos) — no es un bug.
  inserted_rows?: number;
  updated_rows?: number;
  deleted_rows?: number;
  changed_formulas?: number;
};

// A 400 from list-sheets/get-sheet-tabs/get-sheet-headers/save-sheet-mapping/
// sync-sheets can mean "Google revoked access" (reconnect_required: true), a
// company-level pause ("source_disabled": true — an admin turned off the
// "sheet" source), a validation error ({error}), or a "the sheet's columns
// changed" list — never assume it's just {error} like the generic
// lib/membership.ts 400 handling does.
export type SheetsApiError = {
  reconnectRequired: boolean;
  sourceDisabled: boolean;
  message: string | null;
  missingHeaders?: string[];
  // save-sheet-mapping, 400: un field_key del mapeo ya está en uso por OTRA
  // conexión activa de la misma company — { field_key: [connection_id, …] }.
  // Antes esto se guardaba silencioso y los valores de las dos conexiones se
  // sumaban entre sí sin que nadie lo supiera (bug real, no solo validación
  // nueva) — ver GrowthTrackerSheets.tsx handleSaveMapping.
  duplicateFieldKeys?: Record<string, string[]>;
  // save-sheet-mapping, 400 (contrato 2026-08-30): ya existe OTRA conexión
  // activa para esta misma hoja+pestaña — guard server-side, complementa el
  // chequeo client-side ya hecho antes de llegar acá (ver
  // GrowthTrackerSheets.tsx, bug real encontrado en vivo 2026-08-29).
  duplicateConnectionId?: string;
  // save-sheet-mapping, 400 (contrato 2026-08-31, modos "grid"/"eav"): una
  // coordenada/columna que se había confirmado con extract-sheet-layout ya
  // no existe en la hoja real (se re-subió una versión distinta entre el
  // análisis y la confirmación) — hay que volver a llamar a
  // extract-sheet-layout, nunca reintentar con los mismos datos.
  layoutStale?: boolean;
  // save-sheet-mapping, 400 "grid inválido"/"eav inválido" (contrato
  // 2026-09-01): qué field_keys vinieron con un value_type no aceptado, y
  // qué valores SÍ acepta — evita tener que adivinar a ciegas qué mandar.
  invalidValueTypes?: { field_key: string; value_type: string }[];
  allowedValueTypes?: string[];
};

export async function parseSheetsError(res: Response): Promise<SheetsApiError> {
  try {
    const data = await res.json();
    return {
      reconnectRequired: data?.reconnect_required === true,
      sourceDisabled: data?.source_disabled === true,
      message: typeof data?.error === "string" ? data.error : null,
      missingHeaders: Array.isArray(data?.missing_headers) ? data.missing_headers : undefined,
      duplicateFieldKeys:
        data?.duplicate_field_keys_across_connections && typeof data.duplicate_field_keys_across_connections === "object"
          ? data.duplicate_field_keys_across_connections
          : undefined,
      duplicateConnectionId: typeof data?.duplicate_connection_id === "string" ? data.duplicate_connection_id : undefined,
      // El contrato no manda un booleano dedicado para este caso — reason
      // solo viene presente en el error de "hoja cambió", se usa como
      // discriminador.
      layoutStale: typeof data?.reason === "string",
      invalidValueTypes: Array.isArray(data?.invalid_value_types) ? data.invalid_value_types : undefined,
      allowedValueTypes: Array.isArray(data?.allowed_value_types) ? data.allowed_value_types : undefined,
    };
  } catch {
    return { reconnectRequired: false, sourceDisabled: false, message: null };
  }
}

// ---- Subida de Excel (2026-08-30) ----

export type WorkbookSheetPreview = { sheet_name: string; headers: string[]; sample_rows: unknown[][] };

export type RequestWorkbookUploadUrlResponse = { upload_id: string; upload_url: string; storage_path: string };

export type ConfirmWorkbookUploadResponse = { upload_id: string; status: "done" | "error" };

export type GetUploadStatusResponse = {
  status: "pending_upload" | "done" | "error";
  sheets: WorkbookSheetPreview[] | null;
  error: string | null;
};

// ---- Clasificación de spreadsheet + rol de fuente + sync (2026-08-30) ----

// "row_based" = una fila por período/registro, el mapeo de columnas de
// siempre (period_column + field_mappings). "grid" = período en un eje
// (columnas o filas) y conceptos en el otro, ej. un estado de resultados
// con meses en columnas — necesita extract-sheet-layout. "eav" = formato
// vertical fecha/nombre-de-métrica/valor en vez de una columna por métrica
// — también necesita extract-sheet-layout. Ausente (respuesta vieja
// cacheada) se trata como "row_based", mismo default que aplica backend.
export type SheetLayout = "row_based" | "grid" | "eav";

export type ClassifiedSheet = {
  sheet_name: string;
  spreadsheet_type: SpreadsheetType;
  row_semantics: string;
  layout?: SheetLayout;
  confidence: Confidence;
  suggested_data_role: Exclude<DataRole, "source_of_truth">;
};

// ---- extract-sheet-layout (2026-08-31) — reemplaza a
// analyze-transactional-sheet cuando classify-workbook detecta layout
// "grid"/"eav". Nunca trae valores numéricos de la hoja, solo
// posiciones/nombres — el preview de datos reales sale de sample_rows que
// el frontend ya tiene, no de esta respuesta. ----

export type ExtractSheetLayoutRequest = {
  company_id: string;
  sheet_name: string;
  layout_hint: Extract<SheetLayout, "grid" | "eav">;
  source: "sheet" | "excel";
  upload_id?: string; // requerido si source="excel"
  account_id?: string; // requerido si source="sheet"
  spreadsheet_id?: string; // requerido si source="sheet"
  // Solo source="sheet": ignora el cache de backend y vuelve a analizar —
  // usar cuando el founder edita la hoja real después de haberla analizado.
  force?: boolean;
};

export type PeriodAxisEntry = { index: number; period: string; confidence: Confidence };

export type ConceptAxisEntry = {
  index: number;
  label: string;
  suggested_field_key: string;
  // Contrato backend (2026-09-01): garantizado "number"|"text" — el backend
  // normaliza cualquier valor que la IA devuelva fuera de ese enum antes de
  // responder. Antes de este contrato se vieron en vivo "monetary" y
  // "currency" en corridas reales (ninguno aceptado por save-sheet-mapping,
  // ver normalizeConceptValueType en GrowthTrackerSheets.tsx) — ya no
  // deberían aparecer, pero esa normalización queda como red de seguridad.
  value_type: "number" | "text";
  data_maturity: "raw" | "calculated";
  derived_from?: string[];
  confidence: Confidence;
};

export type ExtractSheetLayoutGridResponse = {
  layout: "grid";
  sheet_name: string;
  period_orientation: "columns" | "rows";
  period_axis: PeriodAxisEntry[];
  concept_axis: ConceptAxisEntry[];
};

export type EavMetricMapping = {
  observed_value: string;
  field_key: string;
  value_type: "number" | "text";
  data_maturity: "raw" | "calculated";
  confidence: Confidence;
};

export type ExtractSheetLayoutEavResponse = {
  layout: "eav";
  sheet_name: string;
  eav_period_column: string;
  eav_metric_name_column: string;
  eav_value_column: string;
  eav_metric_mapping: EavMetricMapping[];
};

export type ExtractSheetLayoutResponse = ExtractSheetLayoutGridResponse | ExtractSheetLayoutEavResponse;

// ---- get-workbook-download-url (2026-08-31) ----

export type GetWorkbookDownloadUrlResponse = { download_url: string; file_name: string };

export type SetConnectionSyncSettingsResponse = {
  connection_id: string;
  sync_mode: SyncMode | null;
  sync_frequency: SyncFrequency | null;
  next_sync_at: string | null;
  freshness_sla: string | null;
};

// ---- Datos crudos: consulta agregada bajo demanda (formulaEngine.ts) ----

// Sin "last" acá — a diferencia del viejo modelo de agregación en la
// conexión, esto es lo que query-raw-field acepta hoy.
export type RawFieldAggregation = "sum" | "count" | "count_distinct" | "average";

// AND entre objetos de este array, OR dentro de los "values" de uno solo —
// mismo criterio que el viejo MetricFilter, ahora vive en la llamada a
// query-raw-field en vez de en el mapeo de la conexión.
export type RawFieldFilter = { field_key: string; values: string[] };

export type QueryRawFieldsRequestItem = {
  period: string; // "YYYY-MM"
  field_key: string;
  aggregation: RawFieldAggregation;
  distinct_field_key?: string;
  filters?: RawFieldFilter[];
};

export type QueryRawFieldsRequest = {
  company_id: string;
  queries: QueryRawFieldsRequestItem[];
};

export type QueryRawFieldsResponseItem = {
  field_key: string;
  aggregation: RawFieldAggregation;
  period: string;
  value: number | null;
};

export type QueryRawFieldsResponse = { results: QueryRawFieldsResponseItem[] };
