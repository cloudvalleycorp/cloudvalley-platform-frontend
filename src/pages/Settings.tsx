import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { useStartup } from "@/hooks/useStartup";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Link } from "react-router-dom";
import { Eye, Lock, ShieldCheck } from "lucide-react";
import { IntegrationsSection } from "@/components/IntegrationsSection";
import { MyOrganization } from "@/components/MyOrganization";
import { OrganizationSection } from "@/components/OrganizationSection";

export default function Settings() {
  const { startup } = useStartup();
  const { role, company_id, fund_id } = useAuth();
  const [privacySummary, setPrivacySummary] = useState({
    metricsPrivate: 0,
    metricsTotal: 0,
    docsPrivate: 0,
    docsTotal: 0,
  });

  useEffect(() => {
    if (!startup) return;
    (async () => {
      const [{ count: metricsTotal }, { data: mPriv }, { count: docsTotal }, { data: dPriv }] = await Promise.all([
        supabase
          .from("metric_configs")
          .select("metric_id", { count: "exact", head: true })
          .eq("startup_id", startup.id)
          .eq("is_active", true),
        supabase
          .from("metric_privacy")
          .select("metric_id")
          .eq("startup_id", startup.id)
          .eq("is_public", false),
        supabase
          .from("documents")
          .select("id", { count: "exact", head: true })
          .eq("startup_id", startup.id),
        supabase
          .from("document_privacy")
          .select("document_id")
          .eq("startup_id", startup.id)
          .eq("is_public", false),
      ]);
      setPrivacySummary({
        metricsTotal: metricsTotal ?? 0,
        metricsPrivate: mPriv?.length ?? 0,
        docsTotal: docsTotal ?? 0,
        docsPrivate: dPriv?.length ?? 0,
      });
    })();
  }, [startup?.id]);

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-8 py-12 space-y-8">
        <PageHeader
          title="Configuración"
          subtitle={
            <>
              {role === "investor" ? "Tu organización, equipo e integraciones." : "Tu startup, equipo e integraciones."} Para editar tu perfil personal, andá a{" "}
              <Link to="/account" className="underline underline-offset-2 hover:text-foreground">
                Mi cuenta
              </Link>
              . Para gestionar {role === "investor" ? "las startups conectadas" : "los fondos conectados"}, andá a{" "}
              <Link to="/conexiones" className="underline underline-offset-2 hover:text-foreground">
                Conexiones
              </Link>
              .
            </>
          }
          className="mb-0"
        />

        {/* Mi organización + Miembros */}
        {((role === "user" && !!company_id) || (role === "investor" && !!fund_id)) && (
          <>
            <MyOrganization hideProfile />
            <OrganizationSection />
          </>
        )}

        {/* Privacidad e Integraciones son conceptos del lado startup (qué
            métricas/docs comparte, qué herramientas sincroniza) — no aplican
            a un fondo/inversor. Qué organizaciones están conectadas a la
            startup se gestiona en /conexiones, no acá. */}
        {role === "user" && (
          <>
            {/* Privacidad */}
            <section className="border border-border rounded-lg p-6 bg-card space-y-4">
              <div className="flex items-center gap-2">
                <ShieldCheck size={14} strokeWidth={1.5} className="text-muted-foreground" />
                <h2 className="text-sm font-medium text-foreground">Privacidad</h2>
              </div>
              <p className="text-xs text-muted-foreground -mt-2">
                Controlá qué métricas y documentos pueden ver tus organizaciones.
              </p>
              <div className="grid grid-cols-2 gap-3">
                <Link
                  to="/metrics"
                  className="border border-border rounded-lg p-4 hover:bg-surface transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Métricas</span>
                    {privacySummary.metricsPrivate > 0 ? (
                      <Lock size={12} strokeWidth={1.5} className="text-muted-foreground" />
                    ) : (
                      <Eye size={12} strokeWidth={1.5} className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="mt-2 text-sm">
                    <span className="text-foreground tabular-nums">
                      {privacySummary.metricsTotal - privacySummary.metricsPrivate}
                    </span>
                    <span className="text-muted-foreground"> visibles · </span>
                    <span className="text-foreground tabular-nums">{privacySummary.metricsPrivate}</span>
                    <span className="text-muted-foreground"> privadas</span>
                  </div>
                </Link>
                <Link
                  to="/data-room"
                  className="border border-border rounded-lg p-4 hover:bg-surface transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                >
                  <div className="flex items-center justify-between">
                    <span className="text-xs text-muted-foreground">Documentos</span>
                    {privacySummary.docsPrivate > 0 ? (
                      <Lock size={12} strokeWidth={1.5} className="text-muted-foreground" />
                    ) : (
                      <Eye size={12} strokeWidth={1.5} className="text-muted-foreground" />
                    )}
                  </div>
                  <div className="mt-2 text-sm">
                    <span className="text-foreground tabular-nums">
                      {privacySummary.docsTotal - privacySummary.docsPrivate}
                    </span>
                    <span className="text-muted-foreground"> visibles · </span>
                    <span className="text-foreground tabular-nums">{privacySummary.docsPrivate}</span>
                    <span className="text-muted-foreground"> privados</span>
                  </div>
                </Link>
              </div>
            </section>

            <IntegrationsSection />
          </>
        )}
      </div>
    </AppLayout>
  );
}
