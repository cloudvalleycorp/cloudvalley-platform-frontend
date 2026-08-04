import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { NoMembershipScreen, NoMembershipBanner } from "@/components/NoMembershipScreen";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { Building2 } from "lucide-react";

export default function InvestorPortfolio() {
  const {
    user,
    loading,
    isOrgViewer,
    fund_id,
    portfolio_company_ids,
    portfolio_company_names,
    email,
  } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [reopen, setReopen] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isOrgViewer) return <Navigate to="/dashboard" replace />;

  if (!fund_id) {
    if (!dismissed || reopen) {
      return (
        <AppLayout>
          <NoMembershipScreen
            role="investor"
            email={email}
            onDismiss={() => {
              setDismissed(true);
              setReopen(false);
            }}
          />
        </AppLayout>
      );
    }
    return (
      <AppLayout>
        <div className="max-w-6xl mx-auto px-8 py-12">
          <NoMembershipBanner role="investor" onOpen={() => setReopen(true)} />
          <EmptyState
            icon={Building2}
            title="No hay portfolio para mostrar."
            description="Vas a ver acá las empresas de tu fondo apenas te unas a uno."
          />
        </div>
      </AppLayout>
    );
  }

  const companies = portfolio_company_ids.map((id, i) => ({
    id,
    name: portfolio_company_names[i] ?? "—",
  }));

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-8">
        <PageHeader
          title="Portfolio"
          subtitle={`${companies.length} empresa${companies.length === 1 ? "" : "s"}`}
        />

        {companies.length === 0 ? (
          <EmptyState
            icon={Building2}
            title="Tu fondo todavía no tiene empresas conectadas."
            description="Las conexiones con startups se gestionan desde Conexiones. Cuando tu fondo conecte con una, va a aparecer acá."
          />
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map((c) => (
              <Link
                key={c.id}
                to={`/portfolio/${c.id}`}
                className="border border-border rounded-lg p-5 bg-card hover:border-foreground/40 transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              >
                <div className="text-base font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground mt-1">Ver detalle</div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </AppLayout>
  );
}