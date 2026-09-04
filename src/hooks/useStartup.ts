import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/lib/apiConfig";

const GET_COMPANY_PROFILE_URL = `${API_BASE_URL}/get-company-profile`;

export type Startup = {
  id: string;
  name: string;
  stage: "pre_seed" | "seed" | "series_a" | null;
  business_model: string | null;
  industry: string | null;
  target_raise_usd: number | null;
  cohort_number: number | null;
  cohort_year: number | null;
  website: string | null;
};

// Mismo shape que CompanyProfile en InvestorCompany.tsx — get-company-profile
// ya devuelve esto real, para cualquier company_id al que el caller tenga
// acceso (un investor viendo una empresa conectada, o un founder viendo la
// suya propia). readiness_score se sacó del tipo: ya viene de list-roadmap
// (ver useRoadmap), no hace falta pedirlo acá también.
type CompanyProfileResponse = {
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

async function fetchStartup(companyId: string): Promise<Startup | null> {
  const res = await fetch(`${GET_COMPANY_PROFILE_URL}?company_id=${encodeURIComponent(companyId)}`, {
    credentials: "include",
  });
  if (!res.ok) return null;
  const data = (await res.json()) as CompanyProfileResponse;
  return {
    id: data.company_id,
    name: data.name,
    stage: data.stage,
    business_model: data.business_model,
    industry: data.industry,
    target_raise_usd: data.target_raise_usd,
    cohort_number: data.cohort_number,
    cohort_year: data.cohort_year,
    website: data.website,
  };
}

/** Data layer del perfil de la propia startup (founder) — habla con el gateway de Cloud Functions, nunca Supabase. */
export function useStartup() {
  const { company_id, role } = useAuth();
  const queryClient = useQueryClient();
  const queryKey = ["startup", company_id] as const;

  const { data: startup, isLoading } = useQuery({
    queryKey,
    queryFn: () => fetchStartup(company_id!),
    enabled: !!company_id && role === "user",
  });

  const refetch = () => queryClient.invalidateQueries({ queryKey });

  return { startup: startup ?? null, loading: isLoading, refetch };
}
