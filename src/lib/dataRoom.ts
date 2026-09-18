import { API_BASE_URL } from "@/lib/apiConfig";

export const LIST_DOCUMENTS_URL = `${API_BASE_URL}/list-documents`;
export const CREATE_DOCUMENT_URL = `${API_BASE_URL}/create-document`;
export const GET_DOCUMENT_UPLOAD_URL = `${API_BASE_URL}/get-document-upload-url`;
export const CONFIRM_DOCUMENT_UPLOAD_URL = `${API_BASE_URL}/confirm-document-upload`;
export const DELETE_DOCUMENT_URL = `${API_BASE_URL}/delete-document`;
export const UPDATE_DOCUMENT_PRIVACY_URL = `${API_BASE_URL}/update-document-privacy`;
export const LINK_DOCUMENT_TASK_URL = `${API_BASE_URL}/link-document-task`;
export const SET_DOCUMENT_VERIFIED_URL = `${API_BASE_URL}/set-document-verified`;
export const LIST_SHARED_DOCUMENTS_URL = `${API_BASE_URL}/list-shared-documents`;

// ---------- Bloque 1: carpetas ----------
export const LIST_DOCUMENT_FOLDERS_URL = `${API_BASE_URL}/list-document-folders`;
export const CREATE_DOCUMENT_FOLDER_URL = `${API_BASE_URL}/create-document-folder`;
export const RENAME_DOCUMENT_FOLDER_URL = `${API_BASE_URL}/rename-document-folder`;
export const MOVE_DOCUMENT_FOLDER_URL = `${API_BASE_URL}/move-document-folder`;
export const DELETE_DOCUMENT_FOLDER_URL = `${API_BASE_URL}/delete-document-folder`;

// ---------- Bloque 2: compartir granular ----------
export const SHARE_DOCUMENT_URL = `${API_BASE_URL}/share-document`;
export const UNSHARE_DOCUMENT_URL = `${API_BASE_URL}/unshare-document`;
export const LIST_DOCUMENT_SHARES_URL = `${API_BASE_URL}/list-document-shares`;
export const SHARE_FOLDER_URL = `${API_BASE_URL}/share-folder`;
export const UNSHARE_FOLDER_URL = `${API_BASE_URL}/unshare-folder`;
export const LIST_FOLDER_SHARES_URL = `${API_BASE_URL}/list-folder-shares`;
export const LIST_ALL_DOCUMENT_SHARES_URL = `${API_BASE_URL}/list-all-document-shares`;

// ---------- Bloque 3: tracking + analítica ----------
export const TRACK_DOCUMENT_VIEW_EVENT_URL = `${API_BASE_URL}/track-document-view-event`;
export const LIST_DOCUMENT_ANALYTICS_URL = `${API_BASE_URL}/list-document-analytics`;

// Legacy — documentos subidos antes de este cambio siguen trayendo `category`
// (uno de estos 7 valores) y `folder_id: null` (no se corrió la migración,
// ver dataRoom folders). Se usa solo para mostrar un label legible en el
// bucket "Sin categorizar", nunca más para crear/filtrar documentos nuevos.
export type DocumentCategory =
  | "corporate"
  | "equity_cap_table"
  | "ip_legal"
  | "financials"
  | "contracts_hr"
  | "pitch"
  | "other";

export const LEGACY_CATEGORY_LABELS: Record<DocumentCategory, string> = {
  corporate: "Corporate",
  equity_cap_table: "Cap Table & Equity",
  ip_legal: "IP & Legal",
  financials: "Financials",
  contracts_hr: "Contracts & HR",
  pitch: "Pitch",
  other: "Otros",
};

export type DocumentStatus = "missing" | "uploaded" | "verified";

// Carpeta real de Data Room (reemplaza las 7 categorías fijas de antes).
// roadmap_pillar_ids: ids (no nombres) de pilares de Roadmap que "piden" un
// documento acá — create-document-folder nunca lo acepta hoy, así que en la
// práctica siempre viene vacío para toda carpeta creada por un founder; se
// deja tipado por si en el futuro se habilita asignarlo por otro lado.
export type DataRoomFolder = {
  id: string;
  company_id: string;
  name: string;
  parent_folder_id: string | null;
  is_locked: boolean;
  roadmap_pillar_ids: string[];
  order_index: number;
  created_at: string;
};

// Shape normalizado que consume DocumentRow.tsx — list-documents (founder,
// una sola company) y list-shared-documents (investor, cross-company) NO
// son intercambiables 1:1 (confirmado por backend 2026-09-04): la fecha se
// llama distinto en cada uno (created_at/updated_at vs. uploaded_at) y solo
// el segundo trae company_name/verified_by_name. useSharedDocuments.ts
// mapea uploaded_at -> created_at al leer la respuesta para que este tipo
// sea el único que el resto del código necesita conocer — ver esa función
// antes de asumir que un campo nuevo de un endpoint ya está disponible acá.
export type DataRoomDocument = {
  id: string;
  // null = documento legacy, subido antes de folders (ver DocumentCategory
  // arriba) — nunca null en un documento creado después de este cambio,
  // create-document ahora exige folder_id.
  folder_id: string | null;
  category: DocumentCategory | null;
  name: string;
  status: DocumentStatus;
  file_url: string | null;
  task_id: string | null;
  task_title: string | null;
  is_public: boolean;
  verified_at: string | null;
  verified_by: string | null;
  created_at: string;
  // Quién creó el registro del documento (create-document) — null si no se
  // puede resolver (usuario borrado, o documento viejo de antes de que el
  // backend guardara este dato). Confirmado real en list-documents Y
  // list-shared-documents 2026-09-04.
  uploaded_by_name: string | null;
  // Solo en list-documents (founder, una sola company).
  updated_at?: string;
  // Solo en list-shared-documents (investor).
  verified_by_name?: string | null;
  company_id?: string;
  company_name?: string;
  // Cadena de carpetas ancestro (raíz -> hoja, incluye la carpeta que
  // contiene el documento) — solo en list-shared-documents. El investor
  // arma su árbol a partir de esto, nunca pide list-document-folders (no
  // existe del lado investor a propósito, ver plan).
  folder_path?: { id: string; name: string }[];
  // Cuenta SOLO shares directos sobre este documento puntual (no cuenta
  // visibilidad heredada de una carpeta compartida) — para no tener que
  // pedir list-document-shares solo para pintar un badge en la fila.
  shared_connection_count?: number;
  // Solo lado investor: cuándo vence la visibilidad de este documento para
  // vos, si vino de un share puntual (null si vino de is_public o de un
  // share sin vencimiento).
  expires_at?: string | null;
};

// Una tarea de Roadmap que requiere documento — para el selector "Vincular
// tarea". `done` refleja si esa tarea ya está completa (no si ESTE documento
// en particular está vinculado a ella).
export type DataRoomTask = {
  id: string;
  title: string;
  pillar_name: string;
  done: boolean;
};

// ---------- Bloque 2: compartir granular ----------

export type ResourceShare = {
  connection_id: string;
  counterpart_name: string;
  expires_at: string | null;
  shared_at: string;
  shared_by_name: string | null;
  is_expired: boolean;
};

export type DocumentShare = ResourceShare & { document_id: string; document_name: string };
export type FolderShare = ResourceShare & { folder_id: string; folder_name: string };

// Unión discriminada de list-all-document-shares — en cada fila solo viene
// poblado UNO de los dos pares (document_id/document_name o
// folder_id/folder_name), el otro es null.
export type AnyResourceShare = ResourceShare & {
  resource_type: "document" | "folder";
  document_id: string | null;
  document_name: string | null;
  folder_id: string | null;
  folder_name: string | null;
};

// ---------- Bloque 3: tracking + analítica ----------

// El cliente v1 solo manda "open"/"download" — "heartbeat"/"close" quedan
// reservados para cuando exista un visor propio in-app (hoy los documentos
// se abren con window.open a una signed URL de GCS, sin DOM propio para
// medir scroll/tiempo activo real).
export type DocumentViewEventType = "open" | "heartbeat" | "close" | "download";

export type TrackDocumentViewEventRequest = {
  document_id: string;
  event_type: DocumentViewEventType;
  active_seconds?: number;
  scroll_pct?: number;
};

export type DocumentAnalyticsByFund = { fund_id: string; opens: number; downloads: number };
export type DocumentAnalyticsByPerson = { viewer_user_id: string; viewer_name: string; opens: number; downloads: number };
export type DocumentAnalytics = {
  document_id: string;
  total_opens: number;
  total_downloads: number;
  by_fund: DocumentAnalyticsByFund[];
  by_person: DocumentAnalyticsByPerson[];
};

// ---------- legacy (documentos sin folder_id, ver arriba) ----------

// Un grupo de documentos para las vistas de investor (InvestorDataRoom.tsx,
// tab Data Room de InvestorCompany.tsx) — o bien una carpeta real
// (identificada por su ruta completa, folder_path) o bien el bucket legacy
// de una categoría vieja (documentos subidos antes de que existieran las
// carpetas, folder_id null). Nunca se pide list-document-folders del lado
// investor (filtraría carpetas sin nada compartido adentro) — el árbol se
// arma 100% a partir de folder_path, que solo trae las carpetas de
// documentos ya visibles.
export type DocGroup = { key: string; label: string; docs: DataRoomDocument[] };

export function groupSharedDocuments(documents: DataRoomDocument[], showCompanyPrefix: boolean): DocGroup[] {
  const groups = new Map<string, DocGroup>();
  for (const doc of documents) {
    const companyPrefix = showCompanyPrefix && doc.company_name ? `${doc.company_name} · ` : "";
    let key: string;
    let label: string;
    if (doc.folder_path && doc.folder_path.length > 0) {
      key = `${doc.company_id ?? ""}::folder::${doc.folder_path.map((f) => f.id).join("/")}`;
      label = `${companyPrefix}${doc.folder_path.map((f) => f.name).join(" / ")}`;
    } else {
      const legacyLabel = doc.category ? LEGACY_CATEGORY_LABELS[doc.category] : "Sin categorizar";
      key = `${doc.company_id ?? ""}::legacy::${doc.category ?? "other"}`;
      label = `${companyPrefix}${legacyLabel}`;
    }
    if (!groups.has(key)) groups.set(key, { key, label, docs: [] });
    groups.get(key)!.docs.push(doc);
  }
  return Array.from(groups.values()).sort((a, b) => a.label.localeCompare(b.label));
}

export const DATA_ROOM_CATEGORIES: { id: DocumentCategory; label: string }[] = [
  { id: "corporate", label: "Corporate" },
  { id: "equity_cap_table", label: "Cap Table & Equity" },
  { id: "ip_legal", label: "IP & Legal" },
  { id: "financials", label: "Financials" },
  { id: "contracts_hr", label: "Contracts & HR" },
  { id: "pitch", label: "Pitch" },
  { id: "other", label: "Otros" },
];
