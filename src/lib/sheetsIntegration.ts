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

export type Aggregation = "sum" | "count" | "count_distinct" | "last" | "average";

export type MetricFilter = { column: string; values: string[] };

// One target metric's config: where its value comes from (or "count rows"),
// how to combine multiple rows in the same period, and which rows count
// toward it at all. A single value_column can feed several of these (e.g.
// "Monto" → new_mrr filtered Evento=New, and separately → churned_mrr
// filtered Evento=Churn) — that's why this is keyed by input_key, not by
// sheet column like the old column_mapping was.
export type MetricMappingConfig = {
  input_key: string;
  aggregation: Aggregation;
  value_column?: string; // required for sum/last/average
  distinct_column?: string; // required for count_distinct
  filters?: MetricFilter[]; // AND across filters, OR within one filter's values
};

// One spreadsheet+sheet mapped to metrics, belonging to one Google account.
// A company can have several of these active at once, across one or more
// accounts — replaces the old singular get-sheet-mapping.
export type SheetConnection = {
  connection_id: string;
  account_id: string;
  google_account_email: string; // denormalizado, para no tener que cruzar con list-google-accounts al listar
  spreadsheet_id: string;
  spreadsheet_name: string;
  sheet_name: string;
  period_column: string;
  metrics: MetricMappingConfig[];
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
// "sheet" source), a validation error ({error}), a "the sheet's columns
// changed" list, or (save-sheet-mapping specifically) one of several
// metrics-config validation problems — never assume it's just {error} like
// the generic lib/membership.ts 400 handling does.
export type SheetsApiError = {
  reconnectRequired: boolean;
  sourceDisabled: boolean;
  message: string | null;
  missingHeaders?: string[];
  invalidInputKeys?: string[];
  duplicateInputKeys?: string[];
  // Distinto de duplicateInputKeys: ese es "repetida dos veces DENTRO del
  // mapeo que estás guardando"; este es "ya está mapeada en OTRA conexión
  // de esta company" — un input_key solo puede estar activo en una conexión
  // a la vez.
  duplicateInputKeysAcrossConnections?: string[];
  invalidAggregations?: { input_key: string; aggregation: string }[];
  missingValueColumn?: string[];
  missingDistinctColumn?: string[];
  malformedFilters?: unknown[];
};

export async function parseSheetsError(res: Response): Promise<SheetsApiError> {
  try {
    const data = await res.json();
    return {
      reconnectRequired: data?.reconnect_required === true,
      sourceDisabled: data?.source_disabled === true,
      message: typeof data?.error === "string" ? data.error : null,
      missingHeaders: Array.isArray(data?.missing_headers) ? data.missing_headers : undefined,
      invalidInputKeys: Array.isArray(data?.invalid_input_keys) ? data.invalid_input_keys : undefined,
      duplicateInputKeys: Array.isArray(data?.duplicate_input_keys) ? data.duplicate_input_keys : undefined,
      duplicateInputKeysAcrossConnections: Array.isArray(data?.duplicate_input_keys_across_connections)
        ? data.duplicate_input_keys_across_connections
        : undefined,
      invalidAggregations: Array.isArray(data?.invalid_aggregations) ? data.invalid_aggregations : undefined,
      missingValueColumn: Array.isArray(data?.missing_value_column) ? data.missing_value_column : undefined,
      missingDistinctColumn: Array.isArray(data?.missing_distinct_column) ? data.missing_distinct_column : undefined,
      malformedFilters: Array.isArray(data?.malformed_filters) ? data.malformed_filters : undefined,
    };
  } catch {
    return { reconnectRequired: false, sourceDisabled: false, message: null };
  }
}

export const AGGREGATION_LABELS: Record<Aggregation, string> = {
  sum: "Sumar",
  count: "Contar filas",
  count_distinct: "Contar valores únicos",
  last: "Último valor",
  average: "Promediar",
};
