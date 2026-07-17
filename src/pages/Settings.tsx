import { useEffect, useState } from "react";
import { AppLayout } from "@/components/AppLayout";
import { useStartup } from "@/hooks/useStartup";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Input } from "@/components/ui/input";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import { OrganizationsPicker, type OrgSelection } from "@/components/OrganizationsPicker";
import { Link } from "react-router-dom";
import { Eye, Lock, Mail, Rocket, Users as UsersIcon, ShieldCheck } from "lucide-react";
import { InviteViewerDialog } from "@/components/InviteViewerDialog";
import { IntegrationsSection } from "@/components/IntegrationsSection";
import { MyOrganization } from "@/components/MyOrganization";
import { OrganizationSection } from "@/components/OrganizationSection";

export default function Settings() {
  const { startup, refetch } = useStartup();
  const { user, role, company_id, fund_id } = useAuth();
  const [name, setName] = useState("");
  const [industry, setIndustry] = useState("");
  const [target, setTarget] = useState("");
  const [website, setWebsite] = useState("");
  const [cohortNumber, setCohortNumber] = useState("");
  const [cohortYear, setCohortYear] = useState("");
  const [orgSelections, setOrgSelections] = useState<OrgSelection[]>([]);
  const [savingOrgs, setSavingOrgs] = useState(false);
  const [orgsMeta, setOrgsMeta] = useState<Record<string, string>>({}); // id -> name
  const [inviteState, setInviteState] = useState<{ open: boolean; orgId: string; orgName: string }>({
    open: false,
    orgId: "",
    orgName: "",
  });
  const [pendingInvites, setPendingInvites] = useState<Array<{ id: string; email: string; org_name: string; status: string }>>([]);
  const [privacySummary, setPrivacySummary] = useState({
    metricsPrivate: 0,
    metricsTotal: 0,
    docsPrivate: 0,
    docsTotal: 0,
  });

  useEffect(() => {
    if (startup) {
      setName(startup.name);
      setIndustry(startup.industry ?? "");
      setTarget(startup.target_raise_usd?.toString() ?? "");
      setWebsite(startup.website ?? "");
      setCohortNumber(startup.cohort_number?.toString() ?? "");
      setCohortYear(startup.cohort_year?.toString() ?? "");
      supabase
        .from("startup_organizations")
        .select("organization_id, batch, year")
        .eq("startup_id", startup.id)
        .then(({ data }) => {
          setOrgSelections(
            (data ?? []).map((o) => ({
              organization_id: o.organization_id,
              batch: o.batch ?? "",
              year: o.year ?? null,
            }))
          );
        });
    }
    if (startup) {
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
    }
  }, [startup?.id, user?.id]);

  // Load org names + pending invites
  useEffect(() => {
    if (orgSelections.length === 0) {
      setOrgsMeta({});
      return;
    }
    const ids = orgSelections.map((o) => o.organization_id);
    supabase
      .from("organizations")
      .select("id, name")
      .in("id", ids)
      .then(({ data }) => {
        setOrgsMeta(Object.fromEntries((data ?? []).map((o: any) => [o.id, o.name])));
      });
  }, [orgSelections]);

  const loadInvites = async () => {
    if (!user || orgSelections.length === 0) {
      setPendingInvites([]);
      return;
    }
    const ids = orgSelections.map((o) => o.organization_id);
    const { data } = await supabase
      .from("organization_invitations")
      .select("id, email, status, organization_id, organizations(name)")
      .eq("invited_by", user.id)
      .in("organization_id", ids)
      .order("created_at", { ascending: false });
    setPendingInvites(
      (data ?? []).map((i: any) => ({
        id: i.id,
        email: i.email,
        org_name: i.organizations?.name ?? "—",
        status: i.status,
      }))
    );
  };

  useEffect(() => { loadInvites(); }, [user?.id, orgSelections.length]);

  const revokeInvite = async (id: string) => {
    const { error } = await supabase
      .from("organization_invitations")
      .update({ status: "revoked" })
      .eq("id", id);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Invitación revocada");
    loadInvites();
  };

  const save = async () => {
    if (!startup || !user) return;
    // TODO: migrar a backend propio
    await supabase.from("startups").update({
      name,
      industry,
      target_raise_usd: target ? Number(target) : null,
      website: website.trim() || null,
      cohort_number: cohortNumber ? Number(cohortNumber) : null,
      cohort_year: cohortYear ? Number(cohortYear) : null,
    }).eq("id", startup.id);
    toast.success("Cambios guardados");
    refetch();
  };

  const saveOrgs = async () => {
    if (!startup) return;
    setSavingOrgs(true);
    try {
      // Replace all org links: delete then insert
      // TODO: migrar a backend propio
      await supabase.from("startup_organizations").delete().eq("startup_id", startup.id);
      if (orgSelections.length > 0) {
        // TODO: migrar a backend propio
        const { error } = await supabase.from("startup_organizations").insert(
          orgSelections.map((o) => ({
            startup_id: startup.id,
            organization_id: o.organization_id,
            batch: o.batch || null,
            year: o.year ?? null,
          }))
        );
        if (error) throw error;
      }
      toast.success("Organizaciones actualizadas");
    } catch (e: any) {
      toast.error(e.message ?? "Error al guardar organizaciones");
    } finally {
      setSavingOrgs(false);
    }
  };

  return (
    <AppLayout>
      <div className="max-w-2xl mx-auto px-8 py-12 space-y-8">
        <div>
          <h1 className="text-3xl font-medium tracking-tight">Configuración</h1>
          <p className="text-sm text-muted-foreground mt-1">
            Tu organización, startup e integraciones. Para editar tu perfil personal, andá a{" "}
            <Link to="/account" className="underline underline-offset-2 hover:text-foreground">
              Mi cuenta
            </Link>
            .
          </p>
        </div>

        {/* Mi organización + Miembros */}
        {((role === "user" && !!company_id) || (role === "investor" && !!fund_id)) && (
          <>
            <MyOrganization hideProfile />
            <OrganizationSection />
          </>
        )}

        {/* Tu startup */}
        <section className="border border-border rounded-lg p-6 bg-card space-y-5">
          <div className="flex items-center gap-2">
            <Rocket size={14} strokeWidth={1.5} className="text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">Tu startup</h2>
          </div>
          <div className="space-y-3">
              <div>
                <Label className="text-xs">Nombre</Label>
                <Input value={name} onChange={(e) => setName(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Industria</Label>
                <Input value={industry} onChange={(e) => setIndustry(e.target.value)} className="mt-1" />
              </div>
              <div>
                <Label className="text-xs">Website</Label>
                <Input
                  type="url"
                  placeholder="https://"
                  value={website}
                  onChange={(e) => setWebsite(e.target.value)}
                  className="mt-1"
                />
              </div>
              <div>
                <Label className="text-xs">Objetivo de ronda (USD)</Label>
                <Input type="number" value={target} onChange={(e) => setTarget(e.target.value)} className="mt-1" />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <Label className="text-xs">Nº de cohort</Label>
                  <Input
                    type="number"
                    min="1"
                    value={cohortNumber}
                    onChange={(e) => setCohortNumber(e.target.value)}
                    className="mt-1"
                  />
                </div>
                <div>
                  <Label className="text-xs">Año del cohort</Label>
                  <Input
                    type="number"
                    min="2000"
                    max="2100"
                    value={cohortYear}
                    onChange={(e) => setCohortYear(e.target.value)}
                    className="mt-1"
                  />
                </div>
              </div>
          </div>
          <Button onClick={save}>Guardar cambios</Button>
        </section>

        {/* Mis organizaciones */}
        <section className="border border-border rounded-lg p-6 bg-card space-y-4">
          <div className="flex items-center gap-2">
            <UsersIcon size={14} strokeWidth={1.5} className="text-muted-foreground" />
            <h2 className="text-sm font-medium text-foreground">Mis organizaciones</h2>
          </div>
          <p className="text-xs text-muted-foreground -mt-2">
              Aceleradoras o fondos a los que pertenece tu startup. Pueden ver las métricas y documentos que marques como públicos.
          </p>
          <OrganizationsPicker value={orgSelections} onChange={setOrgSelections} />
          <Button onClick={saveOrgs} disabled={savingOrgs}>
            {savingOrgs ? "Guardando…" : "Guardar organizaciones"}
          </Button>

          {orgSelections.length > 0 && (
            <div className="pt-4 space-y-2">
              <div className="text-xs font-medium text-muted-foreground">Invitar inversores</div>
              <div className="space-y-2">
                {orgSelections.map((o) => (
                  <div key={o.organization_id} className="flex items-center justify-between border border-border rounded-md px-3 py-2">
                    <span className="text-sm">{orgsMeta[o.organization_id] ?? "Cargando…"}</span>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() =>
                        setInviteState({
                          open: true,
                          orgId: o.organization_id,
                          orgName: orgsMeta[o.organization_id] ?? "",
                        })
                      }
                    >
                      <Mail size={12} className="mr-1" /> Invitar
                    </Button>
                  </div>
                ))}
              </div>

              {pendingInvites.length > 0 && (
                <div className="pt-3">
                  <div className="text-xs font-medium text-muted-foreground mb-2">Invitaciones enviadas</div>
                  <div className="space-y-1">
                    {pendingInvites.map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between text-xs px-3 py-2 border border-border rounded-md">
                        <div>
                          <span className="text-foreground">{inv.email}</span>
                          <span className="text-muted-foreground"> → {inv.org_name}</span>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className={inv.status === "pending" ? "text-muted-foreground" : inv.status === "accepted" ? "text-foreground" : "text-muted-foreground line-through"}>
                            {inv.status === "pending" ? "Pendiente" : inv.status === "accepted" ? "Aceptada" : "Revocada"}
                          </span>
                          {inv.status === "pending" && (
                            <button onClick={() => revokeInvite(inv.id)} className="text-muted-foreground hover:text-foreground">
                              Revocar
                            </button>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </section>

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
              className="border border-border rounded-lg p-4 hover:bg-surface transition-all"
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
              className="border border-border rounded-lg p-4 hover:bg-surface transition-all"
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
      </div>

      <InviteViewerDialog
        open={inviteState.open}
        onOpenChange={(o) => setInviteState((s) => ({ ...s, open: o }))}
        organizationId={inviteState.orgId}
        organizationName={inviteState.orgName}
        onInvited={loadInvites}
      />
    </AppLayout>
  );
}
