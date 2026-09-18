import { useMemo } from "react";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { useFinancialMetrics } from "@/hooks/useFinancialMetrics";
import { useDocuments } from "@/hooks/useDocuments";
import { periodRange } from "@/lib/metricPeriod";
import { Link } from "react-router-dom";
import { Eye, Lock, ShieldCheck } from "lucide-react";
import { IntegrationsSection } from "@/components/IntegrationsSection";
import { MyOrganization } from "@/components/MyOrganization";
import { OrganizationSection } from "@/components/OrganizationSection";
import { ProfileSection } from "@/components/ProfileSection";
import { SectionCard } from "@/components/SectionCard";

// Rango mínimo — acá solo hace falta el catálogo de métricas (largo +
// privacidad), no sus valores por período.
const now = new Date();
const minimalRange = periodRange({ month: now.getMonth() + 1, year: now.getFullYear() }, 0);

export default function Settings() {
  const { role, company_id, fund_id } = useAuth();
  const financial = useFinancialMetrics(role === "user" ? company_id : null, minimalRange);
  const documents = useDocuments(role === "user" ? company_id : null);

  // Antes leía metric_configs/metric_privacy/documents/document_privacy
  // directo de Supabase — mismos números, derivados de los hooks reales
  // (list-metrics+list-metric-privacy, list-documents) que ya usan
  // Métricas y Data Room.
  const privacySummary = useMemo(() => {
    const metricsTotal = financial.metrics.length;
    const metricsPrivate = financial.metrics.filter((m) => financial.privacy[m.id] === false).length;
    const docsTotal = documents.documents.length;
    // "Privado" ahora es de verdad solo lo que no es is_public NI tiene ningún
    // share puntual — compartir con un fondo en particular (sin marcarlo
    // is_public) ya no cuenta como "privado" a secas, ver ShareDialog.tsx.
    const docsPublic = documents.documents.filter((d) => d.is_public).length;
    const docsPartiallyShared = documents.documents.filter((d) => !d.is_public && !!d.shared_connection_count).length;
    const docsPrivate = docsTotal - docsPublic - docsPartiallyShared;
    return { metricsTotal, metricsPrivate, docsTotal, docsPublic, docsPartiallyShared, docsPrivate };
  }, [financial.metrics, financial.privacy, documents.documents]);

  return (
    <AppLayout>
      {/* Ancho intencionalmente menor al resto (max-w-6xl): es un formulario
          de un solo registro, no una tabla o lista — más ancho no aporta. */}
      <div className="max-w-2xl mx-auto px-8 py-12 space-y-8">
        <PageHeader
          size="compact"
          title="Configuración"
          subtitle={
            <>
              Tu perfil, tu {role === "investor" ? "organización" : "startup"}, quién forma parte
              {role === "user" ? " y tus integraciones" : ""}. Para gestionar{" "}
              {role === "investor" ? "las startups conectadas" : "los fondos conectados"}, andá a{" "}
              <Link to="/conexiones" className="underline underline-offset-2 hover:text-foreground">
                Conexiones
              </Link>
              .
            </>
          }
          className="mb-0"
        />

        {/* Perfil (antes era la pantalla /account aparte — mockup aprobado
            la fusiona acá, un solo shell de Configuración) */}
        <ProfileSection />

        {/* Mi organización + Miembros */}
        {((role === "user" && !!company_id) || (role === "investor" && !!fund_id)) && (
          <>
            <MyOrganization />
            <OrganizationSection />
          </>
        )}

        {/* Privacidad e Integraciones son conceptos del lado startup (qué
            métricas/docs comparte, qué herramientas sincroniza) — no aplican
            a un fondo/inversor. Qué organizaciones están conectadas a la
            startup se gestiona en /conexiones, no acá. */}
        {role === "user" && (
          <>
            <IntegrationsSection />

            {/* Privacidad */}
            <SectionCard
              title={
                <span className="inline-flex items-center gap-2">
                  <ShieldCheck size={14} strokeWidth={1.5} className="text-muted-foreground" />
                  Privacidad
                </span>
              }
              description="Controlá qué métricas y documentos pueden ver tus organizaciones."
            >
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
                    <span className="text-foreground tabular-nums">{privacySummary.docsPublic}</span>
                    <span className="text-muted-foreground"> públicos · </span>
                    {privacySummary.docsPartiallyShared > 0 && (
                      <>
                        <span className="text-foreground tabular-nums">{privacySummary.docsPartiallyShared}</span>
                        <span className="text-muted-foreground"> compartidos · </span>
                      </>
                    )}
                    <span className="text-foreground tabular-nums">{privacySummary.docsPrivate}</span>
                    <span className="text-muted-foreground"> privados</span>
                  </div>
                </Link>
              </div>
            </SectionCard>
          </>
        )}
      </div>
    </AppLayout>
  );
}
