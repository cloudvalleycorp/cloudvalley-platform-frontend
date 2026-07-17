import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { LogOut, Settings as SettingsIcon } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";
import { NoMembershipScreen, NoMembershipBanner } from "@/components/NoMembershipScreen";

export default function InvestorPortfolio() {
  const {
    user,
    loading,
    isOrgViewer,
    fund_id,
    fund_name,
    portfolio_company_ids,
    portfolio_company_names,
    email,
    signOut,
  } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [reopen, setReopen] = useState(false);

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isOrgViewer) return <Navigate to="/dashboard" replace />;

  if (!fund_id) {
    if (!dismissed || reopen) {
      return (
        <div className="min-h-screen bg-background">
          <NoMembershipScreen
            role="investor"
            email={email}
            onDismiss={() => {
              setDismissed(true);
              setReopen(false);
            }}
          />
        </div>
      );
    }
    return (
      <div className="min-h-screen bg-background">
        <div className="max-w-7xl mx-auto px-8 py-12">
          <NoMembershipBanner role="investor" onOpen={() => setReopen(true)} />
          <div className="border border-border rounded-lg p-12 text-center text-sm text-muted-foreground bg-card">
            No hay portfolio para mostrar hasta que te unas a un fondo.
          </div>
        </div>
      </div>
    );
  }

  const companies = portfolio_company_ids.map((id, i) => ({
    id,
    name: portfolio_company_names[i] ?? "—",
  }));

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <span className="text-lg font-medium tracking-tight">CloudValley</span>
            <span className="text-tertiary">·</span>
            <span className="text-sm text-muted-foreground">{fund_name ?? "Tu fondo"}</span>
            <span className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-muted-foreground border border-border">
              Modo lectura
            </span>
          </div>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <Link
              to="/account"
              className="text-muted-foreground hover:text-foreground transition-all duration-150 p-1"
              title="Mi cuenta"
            >
              <SettingsIcon size={16} strokeWidth={1.5} />
            </Link>
            <button
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground transition-all duration-150 p-1"
              title="Cerrar sesión"
            >
              <LogOut size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-7xl mx-auto px-8 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-medium tracking-tight mb-2">Portfolio</h1>
          <p className="text-sm text-muted-foreground">
            {companies.length} empresa{companies.length === 1 ? "" : "s"}
          </p>
        </div>

        {companies.length === 0 ? (
          <div className="border border-border rounded-lg p-12 text-center text-sm text-muted-foreground bg-card">
            Tu fondo todavía no tiene empresas asignadas.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {companies.map((c) => (
              <Link
                key={c.id}
                to={`/portfolio/${c.id}`}
                className="border border-border rounded-lg p-5 bg-card hover:border-foreground/40 transition-all"
              >
                <div className="text-base font-medium">{c.name}</div>
                <div className="text-xs text-muted-foreground mt-1">Ver detalle</div>
              </Link>
            ))}
          </div>
        )}
      </main>
    </div>
  );
}