import { useEffect, useMemo, useState } from "react";
import { Link, Navigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { BackLink } from "@/components/BackLink";
import { PageHeader } from "@/components/PageHeader";
import { SectionCard } from "@/components/SectionCard";
import { useAuth } from "@/contexts/AuthContext";
import { ReadinessScore } from "@/components/ReadinessScore";
import { StageBadge } from "@/components/StageBadge";
import { LoadingCard } from "@/components/LoadingCard";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { useRoadmap } from "@/hooks/useRoadmap";
import { useResendAccess } from "@/hooks/useResendAccess";
import { API_BASE_URL } from "@/lib/apiConfig";
import { MANAGE_COMPANIES_URL } from "@/lib/membership";
import { currentPeriod, type ReportStatus } from "@/lib/financialData";
import { handleGatewayError } from "@/lib/adminGateway";
import { toast } from "sonner";
import { Link2, Users as UsersIcon, Landmark, DollarSign, Network } from "lucide-react";

const GET_COMPANY_PROFILE_URL = `${API_BASE_URL}/get-company-profile`;
const LIST_USERS_URL = `${API_BASE_URL}/list-users`;
const LIST_ALL_CONNECTIONS_URL = `${API_BASE_URL}/list-all-connections`;
const LIST_FINANCIAL_REPORT_STATUS_URL = `${API_BASE_URL}/list-report-status`;

type Stage = "pre_seed" | "seed" | "series_a";
const STAGE_LABELS: Record<Stage, string> = { pre_seed: "Pre-Seed", seed: "Seed", series_a: "Serie A" };

// Mismo shape que Startup en useStartup.ts — ese hook asume "mi propia
// startup" (usa company_id de la sesión), acá el :id de la URL es una startup
// arbitraria que un admin puede o no tener acceso a ver, así que se pide
// directo en vez de reusar el hook. internal_notes confirmado y desplegado
// 2026-09-21 (Bloque 1) — solo viene presente en la respuesta si quien llama
// es admin (nunca null "insinuando" que hay algo oculto para otros roles).
type CompanyProfile = {
  name: string;
  stage: Stage | null;
  business_model: string | null;
  industry: string | null;
  internal_notes: string | null;
};

type UserRow = { user_id: string; is_active: boolean; company_id: string | null };
type ConnectionRow = {
  connection_id: string;
  status: string;
  fund_id: string;
  fund_name: string;
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

  const loadProfile = () => {
    if (!id || !isAdmin) return;
    setLoadingStartup(true);
    fetch(`${GET_COMPANY_PROFILE_URL}?company_id=${encodeURIComponent(id)}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : null))
      .then((data) =>
        setStartup(
          data
            ? {
                name: data.name,
                stage: data.stage ?? null,
                business_model: data.business_model ?? null,
                industry: data.industry ?? null,
                internal_notes: data.internal_notes ?? null,
              }
            : null
        )
      )
      .finally(() => setLoadingStartup(false));
  };
  useEffect(loadProfile, [id, isAdmin]);

  // Cross-links del panel "Accesos rápidos" (Fase 3) — usuarios de esta
  // empresa (list-users es global, se filtra acá igual que ya hace
  // MembersCell en AdminCompanies.tsx), fondo(s) conectado(s) y estado
  // financiero del período actual.
  const [users, setUsers] = useState<UserRow[]>([]);
  useEffect(() => {
    if (!isAdmin) return;
    fetch(LIST_USERS_URL, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { users: [] }))
      .then((data) => setUsers(Array.isArray(data?.users) ? data.users : []))
      .catch(() => setUsers([]));
  }, [isAdmin]);
  const companyUsers = useMemo(() => users.filter((u) => u.company_id === id), [users, id]);

  const [connections, setConnections] = useState<ConnectionRow[]>([]);
  useEffect(() => {
    if (!id || !isAdmin) return;
    fetch(`${LIST_ALL_CONNECTIONS_URL}?company_id=${encodeURIComponent(id)}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { connections: [] }))
      .then((data) => setConnections(Array.isArray(data?.connections) ? data.connections : []))
      .catch(() => setConnections([]));
  }, [id, isAdmin]);
  const connectedFund = connections.find((c) => c.status === "connected");

  const [financialStatus, setFinancialStatus] = useState<ReportStatus | null>(null);
  useEffect(() => {
    if (!id || !isAdmin) return;
    const params = new URLSearchParams({ period: currentPeriod(), company_id: id });
    fetch(`${LIST_FINANCIAL_REPORT_STATUS_URL}?${params.toString()}`, { credentials: "include" })
      .then((res) => (res.ok ? res.json() : { statuses: [] }))
      .then((data) => setFinancialStatus(data?.statuses?.[0]?.status ?? null))
      .catch(() => setFinancialStatus(null));
  }, [id, isAdmin]);

  // Detalles editables (Fase 3, backend confirmado 2026-09-21, Bloque 1).
  const [editStage, setEditStage] = useState<Stage | "">("");
  const [editModel, setEditModel] = useState("");
  const [editNotes, setEditNotes] = useState("");
  const [savingDetails, setSavingDetails] = useState(false);
  useEffect(() => {
    if (!startup) return;
    setEditStage(startup.stage ?? "");
    setEditModel(startup.business_model ?? "");
    setEditNotes(startup.internal_notes ?? "");
  }, [startup]);

  const saveDetails = async () => {
    if (!id) return;
    setSavingDetails(true);
    try {
      const res = await fetch(MANAGE_COMPANIES_URL, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: id,
          stage: editStage || undefined,
          business_model: editModel.trim() || null,
          internal_notes: editNotes.trim() || null,
        }),
      });
      if (await handleGatewayError(res)) return;
      toast.success("Detalles actualizados");
      loadProfile();
    } catch {
      toast.error("No se pudo guardar");
    } finally {
      setSavingDetails(false);
    }
  };

  // Reenviar acceso (Fase 6) — a todos los miembros activos de esta empresa.
  const { resendAccess, sending: resendingAccess } = useResendAccess();
  const [confirmingResend, setConfirmingResend] = useState(false);
  const confirmResend = async () => {
    if (!id) return;
    const ok = await resendAccess({ company_id: id });
    if (ok) setConfirmingResend(false);
  };

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <BackLink to="/admin/companies" label="Volver a Empresas" className="mb-6" />

        {loadingStartup || roadmap.loading ? (
          <LoadingCard lines={4} />
        ) : !startup ? (
          <EmptyState
            icon={UsersIcon}
            title="No se pudo cargar esta empresa."
            description="El id no existe o no corresponde a ninguna empresa del ecosistema."
          />
        ) : (
          <>
            <PageHeader
              title={startup.name}
              subtitle={
                <span className="inline-flex items-center gap-3">
                  <StageBadge stage={startup.stage} />
                  {startup.business_model && <span>{startup.business_model}</span>}
                  {startup.industry && (
                    <>
                      <span>·</span>
                      <span>{startup.industry}</span>
                    </>
                  )}
                </span>
              }
              action={
                <Button variant="outline" onClick={() => setConfirmingResend(true)}>
                  <Link2 size={14} className="mr-1.5" /> Reenviar acceso
                </Button>
              }
            />

            <div className="grid sm:grid-cols-[1.6fr_1fr] gap-5 items-start">
              <div className="space-y-5">
                <SectionCard title="Salud de la cuenta" padding="sm">
                  <div className="grid grid-cols-2 gap-4">
                    <div>
                      <p className="text-xs text-muted-foreground">Readiness score</p>
                      <p className="text-xl font-medium mt-1">
                        {roadmap.readinessScore}
                        <span className="text-sm text-tertiary font-normal">/100</span>
                      </p>
                    </div>
                    <div>
                      <p className="text-xs text-muted-foreground">Datos financieros</p>
                      <p className="text-sm font-medium mt-1.5">
                        {financialStatus === "reportado" && <span className="text-success-dark">Reportado</span>}
                        {financialStatus === "con_errores" && <span className="text-destructive-dark">Con errores</span>}
                        {financialStatus === "pendiente" && <span className="text-muted-foreground">Pendiente</span>}
                        {!financialStatus && <span className="text-muted-foreground">—</span>}
                      </p>
                    </div>
                  </div>
                </SectionCard>

                <SectionCard title="Detalles" padding="sm">
                  <div className="grid grid-cols-2 gap-4 mb-4">
                    <div>
                      <Label className="text-xs">Etapa</Label>
                      <Select value={editStage} onValueChange={(v: Stage) => setEditStage(v)}>
                        <SelectTrigger className="mt-1"><SelectValue placeholder="Elegir…" /></SelectTrigger>
                        <SelectContent>
                          {(Object.keys(STAGE_LABELS) as Stage[]).map((s) => (
                            <SelectItem key={s} value={s}>{STAGE_LABELS[s]}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </div>
                    <div>
                      <Label className="text-xs">Modelo de negocio</Label>
                      <Input
                        value={editModel}
                        onChange={(e) => setEditModel(e.target.value)}
                        placeholder="Ej: SaaS B2B"
                        className="mt-1"
                      />
                    </div>
                  </div>
                  <div>
                    <Label className="text-xs">
                      Notas internas <span className="text-tertiary">— solo visible para el equipo CloudValley</span>
                    </Label>
                    <Textarea
                      value={editNotes}
                      onChange={(e) => setEditNotes(e.target.value)}
                      rows={4}
                      placeholder="Contexto interno sobre esta cuenta…"
                      className="mt-1"
                    />
                  </div>
                  <div className="flex justify-end mt-4">
                    <Button onClick={saveDetails} disabled={savingDetails}>
                      {savingDetails ? "Guardando…" : "Guardar"}
                    </Button>
                  </div>
                </SectionCard>

                <ReadinessScore score={roadmap.readinessScore} pillars={pillars} />
              </div>

              <SectionCard title="Accesos rápidos" padding="sm">
                <div className="space-y-1">
                  <Link to="/admin/users" className="flex items-center justify-between gap-2 py-2 border-b border-border/60 hover:text-primary-dark">
                    <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5"><UsersIcon size={13} strokeWidth={1.5} /> Usuarios</span>
                    <span className="text-sm font-medium">{companyUsers.length}</span>
                  </Link>
                  <Link to="/admin/funds" className="flex items-center justify-between gap-2 py-2 border-b border-border/60 hover:text-primary-dark">
                    <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5"><Landmark size={13} strokeWidth={1.5} /> Fondo conectado</span>
                    <span className="text-sm font-medium">{connectedFund?.fund_name ?? "Ninguno"}</span>
                  </Link>
                  <Link to="/admin/financial-data" className="flex items-center justify-between gap-2 py-2 border-b border-border/60 hover:text-primary-dark">
                    <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5"><DollarSign size={13} strokeWidth={1.5} /> Datos financieros</span>
                    <span className="text-sm font-medium">
                      {financialStatus === "con_errores" ? "Con errores" : financialStatus === "reportado" ? "Al día" : "—"}
                    </span>
                  </Link>
                  <div className="flex items-center justify-between gap-2 py-2">
                    <span className="text-sm text-muted-foreground inline-flex items-center gap-1.5"><Network size={13} strokeWidth={1.5} /> Conexiones</span>
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
        title={`¿Reenviar acceso a todos los miembros de ${startup?.name ?? "esta empresa"}?`}
        description="Cada miembro activo de esta empresa recibe un magic link real por email."
        confirmLabel="Reenviar"
        onConfirm={confirmResend}
        busy={resendingAccess}
      />
    </AppLayout>
  );
}
