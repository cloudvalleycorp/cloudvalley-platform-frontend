import { toast } from "sonner";

export const ACCEPT_INVITE_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/accept-invite";
export const REQUEST_MEMBERSHIP_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/request-membership";
export const LIST_MEMBERSHIP_REQUESTS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-membership-requests";
export const DECIDE_MEMBERSHIP_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/decide-membership";
export const MANAGE_COMPANIES_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/manage-companies";
export const MANAGE_FUNDS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/manage-funds";
export const LIST_USERS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-users";
export const REMOVE_MEMBER_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/remove-member";

export type MembershipRequest = {
  request_id: string;
  email: string;
  full_name: string;
  target_type: "company" | "fund";
  target_name: string;
  requested_at: string;
};

const PENDING_MEMBERSHIP_KEY = "cv:pending_membership";

/**
 * Remembers, client-side, that a join request was sent — so screens like
 * NoMembershipScreen can show "solicitud enviada" after a reload instead of
 * the initial menu. Written from every place that calls request-membership
 * (NoMembershipScreen's own form and CodeInvite's auto-submit), read from
 * NoMembershipScreen. Not authoritative: it's just a local hint, cleared once
 * the session picks up a company_id/fund_id.
 */
export function rememberPendingMembership(code: string) {
  try {
    localStorage.setItem(PENDING_MEMBERSHIP_KEY, JSON.stringify({ code, requestedAt: Date.now() }));
  } catch {
    // ignore storage errors
  }
}

export function forgetPendingMembership() {
  try {
    localStorage.removeItem(PENDING_MEMBERSHIP_KEY);
  } catch {
    // ignore storage errors
  }
}

export function getPendingMembership(): { code: string; requestedAt: number } | null {
  try {
    const raw = localStorage.getItem(PENDING_MEMBERSHIP_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    return parsed?.code ? parsed : null;
  } catch {
    return null;
  }
}

/**
 * Central error handling for membership endpoints:
 * - 401 → redirect to /login
 * - 403 → toast "No autorizado"
 * - 400 → toast with `error` field
 * Returns true when handled (caller should abort). False when response is OK.
 */
export async function handleMembershipError(res: Response): Promise<boolean> {
  if (res.ok) return false;
  if (res.status === 401) {
    window.location.assign("/login");
    return true;
  }
  if (res.status === 403) {
    toast.error("No autorizado");
    return true;
  }
  if (res.status === 400) {
    try {
      const data = await res.json();
      toast.error(data?.error ?? "Error");
    } catch {
      toast.error("Error");
    }
    return true;
  }
  toast.error("Error inesperado");
  return true;
}