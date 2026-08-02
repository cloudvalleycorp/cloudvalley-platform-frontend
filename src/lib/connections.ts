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
};

export type ConnectionTarget = { id: string; name: string };
