import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InviteViewerDialog } from "@/components/InviteViewerDialog";
import { FormDialog } from "@/components/FormDialog";
import { toast } from "sonner";
import { Plus, Trash2, Mail } from "lucide-react";

type Org = {
  id: string;
  name: string;
  type: string;
  website: string | null;
  is_active: boolean;
};

type Member = { user_id: string; email: string | null; name: string | null; created_at: string };
type LinkedStartup = { startup_id: string; name: string; batch: string | null; year: number | null };
type Invitation = { id: string; email: string; status: string; created_at: string };

async function fetchOrgDetails(orgId: string) {
  const [{ data: mems }, { data: links }, { data: invs }] = await Promise.all([
    supabase
      .from("organization_members")
      .select("user_id, created_at")
      .eq("organization_id", orgId),
    supabase
      .from("startup_organizations")
      .select("startup_id, batch, year, startups(name)")
      .eq("organization_id", orgId),
    supabase
      .from("organization_invitations")
      .select("id, email, status, created_at")
      .eq("organization_id", orgId)
      .order("created_at", { ascending: false }),
  ]);

  // Hidratar emails de los members
  const userIds = (mems ?? []).map((m: any) => m.user_id);
  let profilesMap: Record<string, { email: string | null; name: string | null }> = {};
  if (userIds.length > 0) {
    const { data: profs } = await supabase
      .from("profiles")
      .select("id, email, name")
      .in("id", userIds);
    profilesMap = Object.fromEntries((profs ?? []).map((p: any) => [p.id, { email: p.email, name: p.name }]));
  }

  return {
    members: (mems ?? []).map((m: any) => ({
      user_id: m.user_id,
      email: profilesMap[m.user_id]?.email ?? null,
      name: profilesMap[m.user_id]?.name ?? null,
      created_at: m.created_at,
    })) as Member[],
    linked: (links ?? []).map((l: any) => ({
      startup_id: l.startup_id,
      name: l.startups?.name ?? "—",
      batch: l.batch,
      year: l.year,
    })) as LinkedStartup[],
    invites: (invs ?? []) as Invitation[],
  };
}

export default function AdminOrganizations() {
  const { isAdmin, loading } = useAuth();
  const queryClient = useQueryClient();

  const { data: orgs = [] } = useQuery({
    queryKey: ["admin-organizations"],
    queryFn: async () => {
      const { data } = await supabase
        .from("organizations")
        .select("id, name, type, website, is_active")
        .order("name");
      return (data ?? []) as Org[];
    },
    enabled: isAdmin,
  });

  const [createOpen, setCreateOpen] = useState(false);
  const [newOrg, setNewOrg] = useState({ name: "", type: "accelerator", website: "" });
  const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);
  const [inviteOpen, setInviteOpen] = useState(false);

  const { data: details } = useQuery({
    queryKey: ["admin-organization-details", selectedOrg?.id],
    queryFn: () => fetchOrgDetails(selectedOrg!.id),
    enabled: !!selectedOrg,
  });
  const members = details?.members ?? [];
  const linked = details?.linked ?? [];
  const invites = details?.invites ?? [];

  const loadOrgDetails = (org: Org) => setSelectedOrg(org);

  const refreshDetails = () =>
    queryClient.invalidateQueries({ queryKey: ["admin-organization-details", selectedOrg?.id] });

  const createOrgMutation = useMutation({
    mutationFn: async () => {
      if (!newOrg.name.trim()) throw new Error("Nombre requerido");
      const { error } = await supabase.from("organizations").insert({
        name: newOrg.name.trim(),
        type: newOrg.type,
        website: newOrg.website.trim() || null,
      });
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Organización creada");
      setNewOrg({ name: "", type: "accelerator", website: "" });
      setCreateOpen(false);
      queryClient.invalidateQueries({ queryKey: ["admin-organizations"] });
    },
    onError: (error: Error) => toast.error(error.message || "Error al crear organización"),
  });
  const createOrg = () => createOrgMutation.mutate();

  const revokeInviteMutation = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase
        .from("organization_invitations")
        .update({ status: "revoked" })
        .eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Invitación revocada");
      refreshDetails();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const revokeInvite = (id: string) => revokeInviteMutation.mutate(id);

  const removeMemberMutation = useMutation({
    mutationFn: async (userId: string) => {
      if (!selectedOrg) return;
      const { error } = await supabase
        .from("organization_members")
        .delete()
        .eq("organization_id", selectedOrg.id)
        .eq("user_id", userId);
      if (error) throw error;
    },
    onSuccess: () => {
      toast.success("Acceso removido");
      refreshDetails();
    },
    onError: (error: Error) => toast.error(error.message),
  });
  const removeMember = (userId: string) => removeMemberMutation.mutate(userId);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <PageHeader
          title="Organizaciones"
          subtitle="Aceleradoras y fondos con acceso al portfolio."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={14} className="mr-1" /> Nueva organización
            </Button>
          }
        />

        <DataTable
          columns={[
            { header: "Nombre", cell: (o) => <span className="font-medium">{o.name}</span> },
            { header: "Tipo", cell: (o) => <span className="text-muted-foreground capitalize">{o.type}</span> },
            { header: "Website", cell: (o) => <span className="text-muted-foreground">{o.website ?? "—"}</span> },
            { header: "Estado", cell: (o) => <span className="text-muted-foreground">{o.is_active ? "Activa" : "Inactiva"}</span> },
          ]}
          rows={orgs}
          rowKey={(o) => o.id}
          emptyLabel="No hay organizaciones todavía."
          onRowClick={loadOrgDetails}
        />
      </div>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nueva organización"
        onSubmit={createOrg}
        submitLabel="Crear"
      >
        <div>
          <Label className="text-xs">Nombre</Label>
          <Input value={newOrg.name} onChange={(e) => setNewOrg({ ...newOrg, name: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Tipo</Label>
          <Select value={newOrg.type} onValueChange={(v) => setNewOrg({ ...newOrg, type: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="accelerator">Aceleradora</SelectItem>
              <SelectItem value="fund">Fondo / VC</SelectItem>
              <SelectItem value="angel">Angel</SelectItem>
              <SelectItem value="other">Otro</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <Label className="text-xs">Website (opcional)</Label>
          <Input value={newOrg.website} onChange={(e) => setNewOrg({ ...newOrg, website: e.target.value })} className="mt-1" placeholder="https://..." />
        </div>
      </FormDialog>

      {/* Detalle org */}
      <Sheet open={!!selectedOrg} onOpenChange={(o) => !o && setSelectedOrg(null)}>
        <SheetContent className="w-full sm:max-w-xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{selectedOrg?.name}</SheetTitle>
          </SheetHeader>

          {selectedOrg && (
            <div className="space-y-8 mt-6">
              {/* Viewers */}
              <section>
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium">Viewers ({members.length})</h3>
                  <Button size="sm" onClick={() => setInviteOpen(true)}>
                    <Mail size={12} className="mr-1" /> Invitar viewer
                  </Button>
                </div>
                <div className="border border-border rounded-lg divide-y divide-border">
                  {members.length === 0 && (
                    <div className="text-center py-6 text-xs text-muted-foreground">Sin viewers todavía.</div>
                  )}
                  {members.map((m) => (
                    <div key={m.user_id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div>
                        <div className="font-medium">{m.name || m.email || "—"}</div>
                        <div className="text-xs text-muted-foreground">{m.email}</div>
                      </div>
                      <Button size="sm" variant="ghost" onClick={() => removeMember(m.user_id)}>
                        <Trash2 size={12} />
                      </Button>
                    </div>
                  ))}
                </div>
              </section>

              {/* Invitaciones pendientes */}
              {invites.filter((i) => i.status === "pending").length > 0 && (
                <section>
                  <h3 className="text-sm font-medium mb-3">Invitaciones pendientes</h3>
                  <div className="border border-border rounded-lg divide-y divide-border">
                    {invites.filter((i) => i.status === "pending").map((inv) => (
                      <div key={inv.id} className="flex items-center justify-between px-4 py-3 text-sm">
                        <div>
                          <div>{inv.email}</div>
                          <div className="text-xs text-muted-foreground">
                            Enviada {new Date(inv.created_at).toLocaleDateString()}
                          </div>
                        </div>
                        <Button size="sm" variant="ghost" onClick={() => revokeInvite(inv.id)}>
                          Revocar
                        </Button>
                      </div>
                    ))}
                  </div>
                </section>
              )}

              {/* Startups vinculadas */}
              <section>
                <h3 className="text-sm font-medium mb-3">Startups vinculadas ({linked.length})</h3>
                <div className="border border-border rounded-lg divide-y divide-border">
                  {linked.length === 0 && (
                    <div className="text-center py-6 text-xs text-muted-foreground">Sin startups vinculadas.</div>
                  )}
                  {linked.map((l) => (
                    <div key={l.startup_id} className="flex items-center justify-between px-4 py-3 text-sm">
                      <div className="font-medium">{l.name}</div>
                      <div className="text-xs text-muted-foreground">
                        {l.batch ?? "—"} {l.year ? `· ${l.year}` : ""}
                      </div>
                    </div>
                  ))}
                </div>
              </section>
            </div>
          )}
        </SheetContent>
      </Sheet>

      {selectedOrg && (
        <InviteViewerDialog
          open={inviteOpen}
          onOpenChange={setInviteOpen}
          organizationId={selectedOrg.id}
          organizationName={selectedOrg.name}
          onInvited={refreshDetails}
        />
      )}
    </AppLayout>
  );
}