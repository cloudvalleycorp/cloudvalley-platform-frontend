export const REQUEST_CONNECTION_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/request-connection";
export const LIST_CONNECTIONS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-connections";
export const DECIDE_CONNECTION_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/decide-connection";
export const UPDATE_CONNECTION_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/update-connection";
export const LIST_COMPANIES_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-companies";
export const LIST_FUNDS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-funds";

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
