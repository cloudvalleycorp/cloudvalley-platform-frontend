import { Link, Navigate, useParams } from "react-router-dom";
import { ArrowLeft, LogOut } from "lucide-react";
import { useAuth } from "@/contexts/AuthContext";

export default function InvestorCompany() {
  const { company_id } = useParams<{ company_id: string }>();
  const { user, loading, isOrgViewer, fund_name, portfolio_company_ids, portfolio_company_names, signOut } = useAuth();

  if (loading) return null;
  if (!user) return <Navigate to="/login" replace />;
  if (!isOrgViewer) return <Navigate to="/dashboard" replace />;

  const idx = portfolio_company_ids.findIndex((id) => id === company_id);
  const name = idx >= 0 ? portfolio_company_names[idx] : null;

  return (
    <div className="min-h-screen bg-background">
      <header className="border-b border-border">
        <div className="max-w-7xl mx-auto px-8 py-5 flex items-center justify-between">
          <Link
            to="/portfolio"
            className="inline-flex items-center gap-2 text-sm text-muted-foreground hover:text-foreground transition-all"
          >
            <ArrowLeft size={14} strokeWidth={1.5} /> Volver al portfolio
          </Link>
          <div className="flex items-center gap-3">
            <span className="text-sm text-muted-foreground">{user.email}</span>
            <button
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground transition-all p-1"
              title="Cerrar sesión"
            >
              <LogOut size={16} strokeWidth={1.5} />
            </button>
          </div>
        </div>
      </header>

      <main className="max-w-3xl mx-auto px-8 py-12">
        {name === null ? (
          <div className="text-sm text-muted-foreground">
            Esta empresa no forma parte del portfolio de {fund_name ?? "tu fondo"}.
          </div>
        ) : (
          <>
            <h1 className="text-3xl font-medium tracking-tight mb-3">{name}</h1>
            <p className="text-sm text-muted-foreground">
              Próximamente: detalle de esta empresa.
            </p>
          </>
        )}
      </main>
    </div>
  );
}