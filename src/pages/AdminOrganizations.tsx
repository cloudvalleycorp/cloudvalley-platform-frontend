import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Sheet, SheetContent, SheetHeader, SheetTitle } from "@/components/ui/sheet";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { InviteViewerDialog } from "@/components/InviteViewerDialog";
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

export default function AdminOrganizations() {
  const { isAdmin, loading } = useAuth();
  const [orgs, setOrgs] = useState<Org[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newOrg, setNewOrg] = useState({ name: "", type: "accelerator", website: "" });
  const [selectedOrg, setSelectedOrg] = useState<Org | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [linked, setLinked] = useState<LinkedStartup[]>([]);
  const [invites, setInvites] = useState<Invitation[]>([]);
  const [inviteOpen, setInviteOpen] = useState(false);

  const loadOrgs = async () => {
    const { data } = await supabase
      .from("organizations")
      .select("id, name, type, website, is_active")
      .order("name");
    setOrgs((data ?? []) as Org[]);
  };

  useEffect(() => {
    if (isAdmin) loadOrgs();
  }, [isAdmin]);

  const loadOrgDetails = async (org: Org) => {
    setSelectedOrg(org);
    const [{ data: mems }, { data: links }, { data: invs }] = await Promise.all([
      supabase
        .from("organization_members")
        .select("user_id, created_at")
        .eq("organization_id", org.id),
      supabase
        .from("startup_organizations")
        .select("startup_id, batch, year, startups(name)")
        .eq("organization_id", org.id),
      supabase
        .from("organization_invitations")
        .select("id, email, status, created_at")
        .eq("organization_id", org.id)
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

    setMembers(
      (mems ?? []).map((m: any) => ({
        user_id: m.user_id,
        email: profilesMap[m.user_id]?.email ?? null,
        name: profilesMap[m.user_id]?.name ?? null,
        created_at: m.created_at,
      }))
    );
    setLinked(
      (links ?? []).map((l: any) => ({
        startup_id: l.startup_id,
        name: l.startups?.name ?? "—",
        batch: l.batch,
        year: l.year,
      }))
    );
    setInvites((invs ?? []) as Invitation[]);
  };

  const refreshDetails = async () => {
    if (selectedOrg) await loadOrgDetails(selectedOrg);
  };

  const createOrg = async () => {
    if (!newOrg.name.trim()) {
      toast.error("Nombre requerido");
      return;
    }
    // TODO: migrar a backend propio
    const { error } = await supabase.from("organizations").insert({
      name: newOrg.name.trim(),
      type: newOrg.type,
      website: newOrg.website.trim() || null,
    });
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Organización creada");
    setNewOrg({ name: "", type: "accelerator", website: "" });
    setCreateOpen(false);
    loadOrgs();
  };

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
    refreshDetails();
  };

  const removeMember = async (userId: string) => {
    if (!selectedOrg) return;
    const { error } = await supabase
      .from("organization_members")
      .delete()
      .eq("organization_id", selectedOrg.id)
      .eq("user_id", userId);
    if (error) {
      toast.error(error.message);
      return;
    }
    toast.success("Acceso removido");
    refreshDetails();
  };

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-medium tracking-tight">Organizaciones</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Aceleradoras y fondos con acceso al portfolio.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={14} className="mr-1" /> Nueva organización
          </Button>
        </div>

        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left font-normal px-5 py-3">Nombre</th>
                <th className="text-left font-normal px-5 py-3">Tipo</th>
                <th className="text-left font-normal px-5 py-3">Website</th>
                <th className="text-left font-normal px-5 py-3">Estado</th>
              </tr>
            </thead>
            <tbody>
              {orgs.map((o) => (
                <tr
                  key={o.id}
                  className="border-b border-border/50 last:border-0 hover:bg-surface cursor-pointer transition-all"
                  onClick={() => loadOrgDetails(o)}
                >
                  <td className="px-5 py-4 font-medium">{o.name}</td>
                  <td className="px-5 py-4 text-muted-foreground capitalize">{o.type}</td>
                  <td className="px-5 py-4 text-muted-foreground">{o.website ?? "—"}</td>
                  <td className="px-5 py-4 text-muted-foreground">{o.is_active ? "Activa" : "Inactiva"}</td>
                </tr>
              ))}
              {orgs.length === 0 && (
                <tr><td colSpan={4} className="text-center py-12 text-muted-foreground">No hay organizaciones todavía.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Crear org */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva organización</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={createOrg}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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