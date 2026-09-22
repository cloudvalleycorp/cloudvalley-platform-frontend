import { API_BASE_URL } from "@/lib/apiConfig";

export const REQUEST_CONNECTION_URL = `${API_BASE_URL}/request-connection`;
export const LIST_CONNECTIONS_URL = `${API_BASE_URL}/list-connections`;
export const DECIDE_CONNECTION_URL = `${API_BASE_URL}/decide-connection`;
export const UPDATE_CONNECTION_URL = `${API_BASE_URL}/update-connection`;
export const LIST_CONNECTION_TARGETS_URL = `${API_BASE_URL}/list-connection-targets`;

// "disconnected" confirmado en vivo 2026-09-22 vía list-all-connections (no
// estaba en el contrato original del Bloque 7) — resultado de la decisión
// "disconnect" sobre una conexión que estaba "connected", distinto de
// "cancelled" (retirar un pending propio) y "rejected" (rechazar un
// pending ajeno). list-connections (self-service) ya la filtra afuera de
// pending/connected sin necesitar un label — solo list-all-connections
// (admin) necesita mostrarla explícitamente.
export type ConnectionStatus = "pending" | "connected" | "rejected" | "cancelled" | "disconnected";
export type ConnectionDirection = "sent" | "received";
export type ConnectionDecision = "approve" | "reject" | "cancel" | "disconnect";

export type Connection = {
  connection_id: string;
  status: ConnectionStatus;
  direction: ConnectionDirection;
  counterpart_id: string;
  counterpart_name: string;
  counterpart_type: "company" | "fund";
  message: string | null;
  requested_by_name: string;
  created_at: string;
  responded_at: string | null;
  batch: string | null;
  year: number | null;
  // Bonus entregado por backend junto al paquete de logos/perfil de fondo
  // (2026-09-19, sin pedirlo puntualmente) — logo con el mismo criterio de
  // signed URL ~60min y tope de 60 por listado que portfolio_companies.
  counterpart_logo_url: string | null;
  counterpart_vertical: string | null;
  counterpart_website_url: string | null;
  counterpart_linkedin_url: string | null;
};

export type ConnectionTarget = { id: string; name: string };

// Admin-only, confirmado y desplegado 2026-09-21 (Bloque 7 del plan de
// Admin) — a diferencia de list-connections (scopeado a la sesión de un
// usuario, con "direction"/"counterpart_*" relativos a "yo"), acá no hay un
// "yo" implícito: siempre viene company_id Y fund_id explícitos. Reemplaza
// tener que abrir fondo por fondo para ver pending/rejected/cancelled.
export const LIST_ALL_CONNECTIONS_URL = `${API_BASE_URL}/list-all-connections`;

export type AdminConnection = {
  connection_id: string;
  status: ConnectionStatus;
  company_id: string;
  company_name: string;
  fund_id: string;
  fund_name: string;
  requested_by_org_type: "company" | "fund";
  message: string | null;
  batch: string | null;
  year: number | null;
  requested_by_name: string;
  created_at: string;
  responded_at: string | null;
  // Hasta 60 logos firmados por respuesta (mismo tope que el resto de listas
  // de la plataforma) — más allá de eso vienen null, el resto de los datos
  // completo igual.
  company_logo_url: string | null;
  company_vertical: string | null;
  company_website_url: string | null;
  company_linkedin_url: string | null;
  fund_logo_url: string | null;
  fund_vertical: string | null;
  fund_website_url: string | null;
  fund_linkedin_url: string | null;
};
