import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { BackLink } from "@/components/BackLink";
import { PageHeader } from "@/components/PageHeader";
import { SectionCard } from "@/components/SectionCard";
import { LoadingCard } from "@/components/LoadingCard";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useResendAccess } from "@/hooks/useResendAccess";
import { API_BASE_URL } from "@/lib/apiConfig";
import { Link2, Users as UsersIcon, Building2 } from "lucide-react";

const LIST_FUNDS_URL = `${API_BASE_URL}/list-funds`;
const LIST_USERS_URL = `${API_BASE_URL}/list-users`;
const LIST_ALL_CONNECTIONS_URL = `${API_BASE_URL}/list-all-connections`;

// A diferencia de AdminStartup.tsx, no hay campo de notas internas para
// fondos todavía — Bloque 1 (metadata editable admin-only) solo se pidió y
// confirmó para companies (stage/business_model/internal_notes viven en
// manage-companies/get-company-profile). Si hace falta lo mismo para
// fondos, es un pedido de backend nuevo — no se inventa acá.
type Fund = {
  fund_id: string;
  name: string;
  is_active: boolean;
  is_demo: boolean;
  created_at: string | null;
};
type UserRow = { user_id: string; is_active: boolean; fund_id: string | null };
type PendingConnection = {
  connection_id: string;
  status: string;
  company_id: string;
  company_name: string;
};

export default function AdminFund() {
  const { id } = useParams();
  const { isAdmin, loading } = useAuth();

  const [fund, setFund] = useState<Fund | null>(null);
  const [loadingFund, setLoadingFund] = useState(true);
  useEffect(() => {
    if (!id || !isAdmin) return;
    setLoadingFund(true);
    fetch(LIST_FUNDS_URL, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { funds: [] }))
      .then((data) => {
        const funds = Array.isArray(data?.funds) ? (data.funds as Fund[]) : [];
        setFund(funds.find((f) => f.fund_id === id) ?? null);
      })
      .finally(() => setLoadingFund(false));
  }, [id, isAdmin]);

  const [users, setUsers] = useState<UserRow[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    fetch(LIST_USERS_URL, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((data) => setUsers(Array.isArray(data?.users) ? data.users : []))
      .catch(() => setUsers([]));
  }, [isAdmin]);
  const fundUsers = useMemo(() => users.filter((u) => u.fund_id === id), [users, id]);

  const [connections, setConnections] = useState<PendingConnection[]>([]);
  useEffect(() => {
    if (!id || !isAdmin) return;
    fetch(`${LIST_ALL_CONNECTIONS_URL}?fund_id=${encodeURIComponent(id)}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { connections: [] }))
      .then((data) => setConnections(Array.isArray(data?.connections) ? data.connections : []))
      .catch(() => setConnections([]));
  }, [id, isAdmin]);
  const activePortfolio = connections.filter((c) => c.status === "connected");
  const pendingCount = connections.filter((c) => c.status === "pending").length;

  const { resendAccess, sending: resendingAccess } = useResendAccess();
  const [confirmingResend, setConfirmingResend] = useState(false);
  const confirmResend = async () => {
    if (!id) return;
    const ok = await resendAccess({ fund_id: id });
    if (ok) setConfirmingResend(false);
  };

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <BackLink to="/admin/funds" label="Volver a Fondos" className="mb-6" />

        {loadingFund ? (
          <LoadingCard lines={4} />
        ) : !fund ? (
          <EmptyState
            icon={Building2}
            title="No se pudo cargar este fondo."
            description="El id no existe o no corresponde a ningún fondo del ecosistema."
          />
        ) : (
          <>
            <PageHeader
              title={
                <span className="inline-flex items-center gap-2">
                  {fund.name}
                  {fund.is_demo && (
                    <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-teal-subtle text-teal-dark">
                      Demo
                    </span>
                  )}
                </span>
              }
              subtitle={fund.is_active ? "Activo" : "Inactivo"}
              action={
                <Button variant="outline" onClick={() => setConfirmingResend(true)}>
                  <Link2 size={14} className="mr-1.5" /> Reenviar acceso
                </Button>
              }
            />

            <div className="grid sm:grid-cols-[1.6fr_1fr] gap-5 items-start">
              <div className="space-y-5">
                <SectionCard title="Salud del fondo" padding="sm">
                  <div className="grid grid-cols-3 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Portfolio</p>
                      <p className="text-xl font-medium mt-1">{activePortfolio.length}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Conexiones pendientes</p>
                      <p className="text-xl font-medium mt-1">{pendingCount}</p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Se unió</p>
                      <p className="text-sm font-medium mt-1.5">
                        {fund.created_at ? new Date(fund.created_at).toLocaleDateString("es-AR") : "—"}
                      </p>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title={`Portfolio (${activePortfolio.length})`} padding="sm">
                  {activePortfolio.length === 0 ? (
                    <EmptyState bordered={false} icon={Building2} title="Sin empresas conectadas." className="p-4" />
                  ) : (
                    <div className="space-y-1">
                      {activePortfolio.map((c) => (
                        <Link
                          key={c.connection_id}
                          to={`/admin/startup/${c.company_id}`}
                          className="flex items-center justify-between gap-2 py-2 border-b border-border/60 last:border-0 hover:text-primary-dark"
                        >
                          <span className="text-sm">{c.company_name}</span>
                        </Link>
                      ))}
                    </div>
                  )}
                </SectionCard>
              </div>

              <SectionCard title="Accesos rápidos" padding="sm">
                <div className="space-y-1">
                  <Link to="/admin/users" className="flex items-center justify-between gap-2 py-2 border-b border-border/60 hover:text-primary-dark">
                    <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5"><UsersIcon size={13} strokeWidth={1.5} /> Usuarios del fondo</span>
                    <span className="text-sm font-medium">{fundUsers.length}</span>
                  </Link>
                  <div className="flex items-center justify-between gap-2 py-2">
                    <span className="text-sm text-muted-foreground">Conexiones totales</span>
                    <span className="text-sm font-medium">{connections.length}</span>
                  </div>
                </div>
              </SectionCard>
            </div>
          </>
        )}
      </div>

      <ConfirmationDialog
        open={confirmingResend}
        onOpenChange={setConfirmingResend}
        title={`¿Reenviar acceso a todos los miembros de ${fund?.name ?? "este fondo"}?`}
        description="Cada miembro activo de este fondo recibe un magic link real por email."
        confirmLabel="Reenviar"
        onConfirm={confirmResend}
        busy={resendingAccess}
      />
    </AppLayout>
  );
}
