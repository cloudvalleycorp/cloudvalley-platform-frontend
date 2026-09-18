import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { BackLink } from "@/components/BackLink";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { ReadinessScore } from "@/components/ReadinessScore";
import { StageBadge } from "@/components/StageBadge";
import { LoadingCard } from "@/components/LoadingCard";
import { useRoadmap } from "@/hooks/useRoadmap";
import { API_BASE_URL } from "@/lib/apiConfig";

const GET_COMPANY_PROFILE_URL = `${API_BASE_URL}/get-company-profile`;

// Mismo shape que Startup en useStartup.ts — ese hook asume "mi propia
// startup" (usa company_id de la sesión), acá el :id de la URL es una startup
// arbitraria que un admin puede o no tener acceso a ver, así que se pide
// directo en vez de reusar el hook.
type CompanyProfile = {
  name: string;
  stage: "pre_seed" | "seed" | "series_a" | null;
  business_model: string | null;
  industry: string | null;
};

export default function AdminStartup() {
  const { id } = useParams();
  const { isAdmin, loading } = useAuth();
  const [startup, setStartup] = useState<CompanyProfile | null>(null);
  const [loadingStartup, setLoadingStartup] = useState(true);

  const roadmap = useRoadmap(id ?? null);
  // Mismo cálculo por pilar que RoadmapTaskList.tsx (% de tareas done) —
  // ReadinessScore.tsx solo necesita {name, score}, no hace falta duplicar
  // la lógica de src/lib/score.ts (borrado: leía Supabase directo y quedó
  // sin ningún otro uso una vez migrado esto).
  const pillars = roadmap.pillars.map((p) => {
    const items = roadmap.tasks.filter((t) => t.pillar_id === p.id);
    const done = items.filter((t) => t.status === "done").length;
    return { name: p.name, score: items.length > 0 ? Math.round((done / items.length) * 100) : 0 };
  });

  useEffect(() => {
    if (!id || !isAdmin) return;
    setLoadingStartup(true);
    fetch(`${GET_COMPANY_PROFILE_URL}?company_id=${encodeURIComponent(id)}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) => setStartup(data ? { name: data.name, stage: data.stage, business_model: data.business_model, industry: data.industry } : null))
      .finally(() => setLoadingStartup(false));
  }, [id, isAdmin]);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <BackLink to="/admin" label="Volver al ecosistema" className="mb-6" />

        {startup && (
          <PageHeader
            title={startup.name}
            subtitle={
              <span className="inline-flex items-center gap-3">
                <StageBadge stage={startup.stage} />
                {startup.business_model && <span className="capitalize">{startup.business_model.replace("_", " ")}</span>}
                {startup.industry && (
                  <>
                    <span>·</span>
                    <span>{startup.industry}</span>
                  </>
                )}
              </span>
            }
          />
        )}

        {loadingStartup || roadmap.loading ? (
          <LoadingCard lines={4} />
        ) : (
          <ReadinessScore score={roadmap.readinessScore} pillars={pillars} />
        )}
      </div>
    </AppLayout>
  );
}
