import { API_BASE_URL } from "@/lib/apiConfig";

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

export type SheetSummary = { spreadsheet_id: string; name: string };

// Una columna de la planilla mapeada a un campo crudo propio de ESTA
// conexión — nada de agregación ni filtros acá (eso vive en las fórmulas de
// Métricas, ver formulaEngine.ts). field_key es un namespace propio de la
// conexión: no tiene que coincidir con ningún input_key del catálogo de
// métricas, es libre (snake_case).
export type FieldMapping = {
  column: string;
  field_key: string;
  value_type: "number" | "text";
};

// One spreadsheet+sheet mapped to raw fields, belonging to one Google
// account. A company can have several of these active at once, across one
// or more accounts — replaces the old singular get-sheet-mapping.
export type SheetConnection = {
  connection_id: string;
  account_id: string;
  google_account_email: string; // denormalizado, para no tener que cruzar con list-google-accounts al listar
  spreadsheet_id: string;
  spreadsheet_name: string;
  sheet_name: string;
  period_column: string;
  field_mappings: FieldMapping[];
  last_synced_at: string | null;
  last_sync_status: string | null;
  created_at: string;
};

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
};

export async function parseSheetsError(res: Response): Promise<SheetsApiError> {
  try {
    const data = await res.json();
    return {
      reconnectRequired: data?.reconnect_required === true,
      sourceDisabled: data?.source_disabled === true,
      message: typeof data?.error === "string" ? data.error : null,
      missingHeaders: Array.isArray(data?.missing_headers) ? data.missing_headers : undefined,
    };
  } catch {
    return { reconnectRequired: false, sourceDisabled: false, message: null };
  }
}

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
