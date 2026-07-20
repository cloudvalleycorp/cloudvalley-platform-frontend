import { createContext, useContext, useEffect, useState, ReactNode } from "react";

export const GET_SESSION_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/get-session";
export const REFRESH_SESSION_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/refresh-session";
export const LOGOUT_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/logout";
export const REQUEST_MAGIC_LINK_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/request-magic-link";
const GET_MY_ORGANIZATION_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/get-my-organization";

export type Role = "admin" | "user" | "investor";

// Minimal shape kept for backwards-compat with existing pages that read user.id / user.email.
// `id` is set to `company_id` when available (else email) so TS keeps compiling; data queries
// that still rely on Supabase auth.uid() are marked with TODOs to migrate later.
export type AuthUser = { id: string; email: string };

type AuthContextType = {
  user: AuthUser | null;
  session: null;
  loading: boolean;
  role: Role | null;
  email: string | null;
  user_id: string | null;
  full_name: string | null;
  company_id: string | null;
  company_name: string | null;
  fund_id: string | null;
  fund_name: string | null;
  is_owner: boolean;
  portfolio_company_ids: string[];
  portfolio_company_names: string[];
  isAdmin: boolean;
  isOrgViewer: boolean;
  signOut: () => Promise<void>;
  refreshSession: () => Promise<boolean>;
};

const AuthContext = createContext<AuthContextType | undefined>(undefined);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const [role, setRole] = useState<Role | null>(null);
  const [email, setEmail] = useState<string | null>(null);
  const [userId, setUserId] = useState<string | null>(null);
  const [fullName, setFullName] = useState<string | null>(null);
  const [companyId, setCompanyId] = useState<string | null>(null);
  const [companyName, setCompanyName] = useState<string | null>(null);
  const [fundId, setFundId] = useState<string | null>(null);
  const [fundName, setFundName] = useState<string | null>(null);
  const [isOwner, setIsOwner] = useState(false);
  const [portfolioIds, setPortfolioIds] = useState<string[]>([]);
  const [portfolioNames, setPortfolioNames] = useState<string[]>([]);

  const applySessionData = (data: any) => {
    setEmail(data.email ?? null);
    setRole((data.role as Role) ?? null);
    setUserId(data.user_id ?? null);
    setFullName(
      data.full_name ?? data.user_full_name ?? data.name ?? null
    );
    setCompanyId(data.company_id ?? null);
    setCompanyName(data.company_name ?? null);
    setFundId(data.fund_id ?? null);
    setFundName(data.fund_name ?? null);
    setIsOwner(!!data.is_owner);
    setPortfolioIds(Array.isArray(data.portfolio_company_ids) ? data.portfolio_company_ids : []);
    setPortfolioNames(Array.isArray(data.portfolio_company_names) ? data.portfolio_company_names : []);
    setUser({ id: data.company_id ?? data.email, email: data.email });
    // get-session ya devuelve full_name. Este fallback a get-my-organization queda
    // como red de contención para sesiones emitidas antes de ese cambio de backend
    // (dura hasta que esa sesión se refresque o el usuario vuelva a loguearse).
    const hasOrg =
      (data.role === "user" && !!data.company_id) ||
      (data.role === "investor" && !!data.fund_id);
    const nameFromSession =
      data.full_name ?? data.user_full_name ?? data.name ?? null;
    if (!nameFromSession && hasOrg) {
      fetch(GET_MY_ORGANIZATION_URL, { credentials: "include" })
        .then((r) => (r.ok ? r.json() : null))
        .then((d: any) => {
          if (!d) return;
          const name =
            d.full_name ??
            d.user_full_name ??
            d.member_full_name ??
            d.user_name ??
            null;
          if (name) setFullName(name);
        })
        .catch(() => {
          // silencioso
        });
    }
  };

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(GET_SESSION_URL, { credentials: "include" });
        if (cancelled) return;
        if (res.status === 200) {
          const data = await res.json();
          applySessionData(data);
        } else {
          setUser(null);
          setRole(null);
          setEmail(null);
          setUserId(null);
          setFullName(null);
          setCompanyId(null);
          setCompanyName(null);
          setFundId(null);
          setFundName(null);
          setIsOwner(false);
          setPortfolioIds([]);
          setPortfolioNames([]);
        }
      } catch {
        if (!cancelled) setUser(null);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const signOut = async () => {
    try {
      await fetch(LOGOUT_URL, { method: "POST", credentials: "include" });
    } catch {
      // ignore network errors, still clear local state and redirect
    }
    setUser(null);
    setRole(null);
    setEmail(null);
    setUserId(null);
    setFullName(null);
    setCompanyId(null);
    setCompanyName(null);
    setFundId(null);
    setFundName(null);
    setIsOwner(false);
    setPortfolioIds([]);
    setPortfolioNames([]);
    window.location.assign("/login");
  };

  const refreshSession = async (): Promise<boolean> => {
    try {
      const res = await fetch(REFRESH_SESSION_URL, {
        method: "POST",
        credentials: "include",
      });
      if (res.status !== 200) return false;
      const data = await res.json();
      applySessionData(data);
      return true;
    } catch {
      return false;
    }
  };

  return (
    <AuthContext.Provider
      value={{
        user,
        session: null,
        loading,
        role,
        email,
        user_id: userId,
        full_name: fullName,
        company_id: companyId,
        company_name: companyName,
        fund_id: fundId,
        fund_name: fundName,
        is_owner: isOwner,
        portfolio_company_ids: portfolioIds,
        portfolio_company_names: portfolioNames,
        isAdmin: role === "admin",
        isOrgViewer: role === "investor",
        signOut,
        refreshSession,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be inside AuthProvider");
  return ctx;
}
