export const GET_SHEETS_STATUS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/get-sheets-status";
export const CONNECT_SHEETS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/connect-sheets";
export const LIST_SHEETS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-sheets";
export const GET_SHEET_TABS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/get-sheet-tabs";
export const GET_SHEET_HEADERS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/get-sheet-headers";
export const SAVE_SHEET_MAPPING_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/save-sheet-mapping";
export const GET_SHEET_MAPPING_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/get-sheet-mapping";
export const SYNC_SHEETS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/sync-sheets";
export const DISCONNECT_SHEETS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/disconnect-sheets";

export type SheetsStatus = {
  connected: boolean;
  reconnect_required: boolean;
  google_account_email: string | null;
  status: string | null;
  has_mapping: boolean;
  last_synced_at: string | null;
  last_sync_status: string | null;
};

export type SheetSummary = { spreadsheet_id: string; name: string };

// header (as it appears in the sheet's first row) -> input_key, or the
// literal string "period" for the one column that's the month/date.
export type ColumnMapping = Record<string, string>;

export type SheetMapping = {
  spreadsheet_id: string;
  spreadsheet_name: string;
  sheet_name: string;
  column_mapping: ColumnMapping;
};

export type SyncRowError = { field: string; reason: string; row?: number; period?: string };

export type SyncResult = {
  status: string;
  import_log_id: string | null;
  rows_processed: number;
  rows_rejected: number;
  row_errors: SyncRowError[];
};

// A 400 from list-sheets/get-sheet-tabs/get-sheet-headers/save-sheet-mapping/
// sync-sheets can mean "Google revoked access" (reconnect_required: true),
// a validation error ({error}), an invalid input_key list, or a "the sheet's
// columns changed" list — never assume it's just {error} like the generic
// lib/membership.ts 400 handling does.
export type SheetsApiError = {
  reconnectRequired: boolean;
  message: string | null;
  invalidInputKeys?: string[];
  missingHeaders?: string[];
};

export async function parseSheetsError(res: Response): Promise<SheetsApiError> {
  try {
    const data = await res.json();
    return {
      reconnectRequired: data?.reconnect_required === true,
      message: typeof data?.error === "string" ? data.error : null,
      invalidInputKeys: Array.isArray(data?.invalid_input_keys) ? data.invalid_input_keys : undefined,
      missingHeaders: Array.isArray(data?.missing_headers) ? data.missing_headers : undefined,
    };
  } catch {
    return { reconnectRequired: false, message: null };
  }
}
