import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { BackLink } from "@/components/BackLink";
import { PageHeader } from "@/components/PageHeader";
import { StageBadge } from "@/components/StageBadge";

const GET_COMPANY_PROFILE_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/get-company-profile";

type CompanyProfile = {
  company_id: string;
  name: string;
  industry: string | null;
  website: string | null;
  stage: "pre_seed" | "seed" | "series_a" | null;
  business_model: string | null;
  target_raise_usd: number | null;
  cohort_number: number | null;
  cohort_year: number | null;
};

export default function InvestorCompany() {
  const { company_id } = useParams<{ company_id: string }>();
  const { user, loading, isOrgViewer, fund_name, portfolio_company_ids, portfolio_company_names } = useAuth();
  const [profile, setProfile] = useState<CompanyProfile | null>(null);
  const [status, setStatus] = useState<"loading" | "ok" | "forbidden" | "not_found" | "error">("loading");

  useEffect(() => {
    if (!company_id) return;
    setStatus("loading");
    (async () => {
      try {
        const res = await fetch(`${GET_COMPANY_PROFILE_URL}?company_id=${encodeURIComponent(company_id)}`, {
          credentials: "include",
        });
        if (res.status === 401) {
          window.location.assign("/login");
          return;
        }
        if (res.status === 403) {
          setStatus("forbidden");
          return;
        }
        if (res.status === 404) {
          setStatus("not_found");
          return;
        }
        if (!res.ok) {
          setStatus("error");
          return;
        }
        const data = (await res.json()) as CompanyProfile;
        setProfile(data);
        setStatus("ok");
      } catch {
        setStatus("error");
      }
    })();
  }, [company_id]);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isOrgViewer) return <Navigate to="/dashboard" replace />;

  const idx = portfolio_company_ids.findIndex((id) => id === company_id);
  const name = idx >= 0 ? portfolio_company_names[idx] : null;

  return (
    <AppLayout>
      <div className="max-w-3xl mx-auto px-8 py-12">
        <BackLink to="/portfolio" label="Volver al portfolio" className="mb-6" />
        {name === null ? (
          <div className="text-sm text-muted-foreground">
            Esta empresa no forma parte del portfolio de {fund_name ?? "tu fondo"}.
          </div>
        ) : status === "loading" ? (
          <div className="text-sm text-muted-foreground">Cargando…</div>
        ) : status === "forbidden" ? (
          <div className="text-sm text-muted-foreground">No tenés acceso a este perfil.</div>
        ) : status === "not_found" ? (
          <div className="text-sm text-muted-foreground">Empresa no encontrada.</div>
        ) : status === "error" ? (
          <div className="text-sm text-muted-foreground">No se pudo cargar el perfil de la empresa.</div>
        ) : (
          profile && (
            <>
              <PageHeader
                title={profile.name}
                subtitle={
                  <div className="flex items-center gap-3 mt-1">
                    <StageBadge stage={profile.stage} />
                    {profile.business_model && (
                      <span className="capitalize">{profile.business_model.replace("_", " ")}</span>
                    )}
                    {profile.industry && <span>{profile.industry}</span>}
                  </div>
                }
              />
              <dl className="grid grid-cols-2 gap-x-4 gap-y-4 text-sm mt-8">
                <div>
                  <dt className="text-xs text-muted-foreground">Website</dt>
                  <dd className="text-foreground truncate">{profile.website || "—"}</dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Objetivo de ronda</dt>
                  <dd className="text-foreground">
                    {profile.target_raise_usd != null ? `USD ${profile.target_raise_usd.toLocaleString()}` : "—"}
                  </dd>
                </div>
                <div>
                  <dt className="text-xs text-muted-foreground">Cohort</dt>
                  <dd className="text-foreground">
                    {profile.cohort_number != null
                      ? `#${profile.cohort_number}${profile.cohort_year ? ` · ${profile.cohort_year}` : ""}`
                      : "—"}
                  </dd>
                </div>
              </dl>
            </>
          )
        )}
      </div>
    </AppLayout>
  );
}