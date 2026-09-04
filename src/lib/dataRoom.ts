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

export type DocumentCategory =
  | "corporate"
  | "equity_cap_table"
  | "ip_legal"
  | "financials"
  | "contracts_hr"
  | "pitch"
  | "other";

export type DocumentStatus = "missing" | "uploaded" | "verified";

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
  category: DocumentCategory;
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

export const DATA_ROOM_CATEGORIES: { id: DocumentCategory; label: string }[] = [
  { id: "corporate", label: "Corporate" },
  { id: "equity_cap_table", label: "Cap Table & Equity" },
  { id: "ip_legal", label: "IP & Legal" },
  { id: "financials", label: "Financials" },
  { id: "contracts_hr", label: "Contracts & HR" },
  { id: "pitch", label: "Pitch" },
  { id: "other", label: "Otros" },
];

// Pilares reales del Roadmap (confirmados en src/pages/Roadmap.tsx /
// src/lib/score.ts — no los nombres en inglés del spec original). El pilar
// de Roadmap llamado "Data Room" (usado acá para Contracts & HR) es un
// concepto distinto de esta pantalla — mismo nombre, sin relación entre sí.
// "other" no tiene pilar asociado a propósito: son documentos sueltos, sin
// vínculo de Roadmap.
export const CATEGORY_TO_ROADMAP_PILLARS: Partial<Record<DocumentCategory, string[]>> = {
  corporate: ["Estructura Corporativa"],
  equity_cap_table: ["Cap Table & Equity"],
  ip_legal: ["IP & Legal"],
  financials: ["Financials"],
  contracts_hr: ["Data Room"],
  pitch: ["Pitch & Narrativa"],
};

// Reverso del mapeo de arriba — para cuando Roadmap sube un documento y
// necesita inferir en qué categoría de Data Room cae, a partir del pilar de
// la tarea (mismo camino de upload que Data Room, ver create-document).
export function categoryForPillarName(pillarName: string): DocumentCategory | null {
  for (const [category, pillars] of Object.entries(CATEGORY_TO_ROADMAP_PILLARS) as [DocumentCategory, string[]][]) {
    if (pillars.includes(pillarName)) return category;
  }
  return null;
}
