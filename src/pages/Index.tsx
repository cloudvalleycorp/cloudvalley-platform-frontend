import { useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";
import { useStartup } from "@/hooks/useStartup";

export default function Index() {
  const navigate = useNavigate();
  const { user, loading: authLoading, isOrgViewer, isAdmin, company_id } = useAuth();
  const { startup, loading: startupLoading } = useStartup();

  useEffect(() => {
    if (authLoading) return;
    if (!user) {
      navigate("/login", { replace: true });
      return;
    }
    if (isOrgViewer) {
      navigate("/portfolio", { replace: true });
      return;
    }
    if (isAdmin) {
      navigate("/admin", { replace: true });
      return;
    }
    // Todos los role="user" van al dashboard; si no tienen company asignada,
    // el propio Dashboard muestra el flujo "sin empresa".
    navigate("/dashboard", { replace: true });
  }, [authLoading, startupLoading, user, startup, isOrgViewer, isAdmin, company_id, navigate]);

  return (
    <div className="min-h-screen flex items-center justify-center text-sm text-muted-foreground">
      Cargando…
    </div>
  );
}
