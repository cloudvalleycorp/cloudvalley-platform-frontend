import { API_BASE_URL } from "@/lib/apiConfig";

export const REQUEST_CONNECTION_URL = `${API_BASE_URL}/request-connection`;
export const LIST_CONNECTIONS_URL = `${API_BASE_URL}/list-connections`;
export const DECIDE_CONNECTION_URL = `${API_BASE_URL}/decide-connection`;
export const UPDATE_CONNECTION_URL = `${API_BASE_URL}/update-connection`;
export const LIST_CONNECTION_TARGETS_URL = `${API_BASE_URL}/list-connection-targets`;

export type ConnectionStatus = "pending" | "connected" | "rejected" | "cancelled";
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
