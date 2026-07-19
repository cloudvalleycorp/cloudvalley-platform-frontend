import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormDialog } from "@/components/FormDialog";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Link2, Copy, Check } from "lucide-react";
import { handleGatewayError } from "@/lib/adminGateway";

const LIST_USERS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-users";
const MANAGE_USERS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/manage-users";
const LIST_COMPANIES_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-companies";
const CREATE_INVITE_LINK_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/create-invite-link";

type Role = "admin" | "user" | "investor";

type User = {
  user_id: string;
  email: string;
  full_name: string | null;
  role: Role;
  company_id: string | null;
  company_name: string | null;
  fund_id: string | null;
  fund_name: string | null;
  is_active: boolean;
};

type Company = { company_id: string; name: string };

function RoleBadge({ role }: { role: Role }) {
  const styles: Record<Role, string> = {
    admin: "bg-purple-100 text-purple-800 border-purple-200",
    user: "bg-blue-100 text-blue-800 border-blue-200",
    investor: "bg-amber-100 text-amber-800 border-amber-200",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${styles[role]}`}>
      {role}
    </span>
  );
}

export default function AdminUsers() {
  const { isAdmin, loading, email: currentEmail } = useAuth();
  const queryClient = useQueryClient();

  const { data: users = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch(LIST_USERS_URL, { credentials: "include" });
      if (await handleGatewayError(res)) throw new Error("No se pudo cargar usuarios");
      const data = await res.json();
      return (data.users ?? []) as User[];
    },
    enabled: isAdmin,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: async () => {
      const res = await fetch(LIST_COMPANIES_URL, { credentials: "include" });
      if (!res.ok) return [] as Company[];
      const data = await res.json();
      return (data.companies ?? []) as Company[];
    },
    enabled: isAdmin,
  });

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ["admin-users"] });

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<{ email: string; full_name: string; role: Role; company_id: string }>({
    email: "",
    full_name: "",
    role: "user",
    company_id: "",
  });
  const [editing, setEditing] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<{ email: string; full_name: string; role: Role; company_id: string }>({
    email: "",
    full_name: "",
    role: "user",
    company_id: "",
  });
  const [editReactivate, setEditReactivate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const [inviteOpen, setInviteOpen] = useState(false);
  const [inviteRole, setInviteRole] = useState<"user" | "investor">("user");
  const [inviteResult, setInviteResult] = useState<{ url: string; expires_at: string } | null>(null);
  const [inviteCopied, setInviteCopied] = useState(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(MANAGE_USERS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: form.email.trim(),
          full_name: form.full_name.trim(),
          role: form.role,
          company_id: form.role === "admin" ? null : form.company_id,
        }),
      });
      if (await handleGatewayError(res)) throw new Error("create failed");
    },
    onSuccess: () => {
      toast.success("Usuario creado");
      setCreateOpen(false);
      invalidateUsers();
    },
  });

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const body: Record<string, unknown> = {
        user_id: editing.user_id,
        email: editForm.email.trim(),
        full_name: editForm.full_name.trim(),
        role: editForm.role,
        company_id: editForm.role === "admin" ? null : editForm.company_id || null,
      };
      if (!editing.is_active && editReactivate) {
        body.is_active = true;
      }
      const res = await fetch(MANAGE_USERS_URL, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      if (await handleGatewayError(res)) throw new Error("update failed");
    },
    onSuccess: () => {
      toast.success("Usuario actualizado");
      setEditing(null);
      invalidateUsers();
    },
  });

  const deactivateMutation = useMutation({
    mutationFn: async (u: User) => {
      const res = await fetch(MANAGE_USERS_URL, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: u.user_id, is_active: false }),
      });
      if (await handleGatewayError(res)) throw new Error("deactivate failed");
    },
    onSuccess: () => {
      toast.success("Usuario desactivado");
      setEditing(null);
      invalidateUsers();
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const res = await fetch(MANAGE_USERS_URL, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: editing.user_id }),
      });
      if (await handleGatewayError(res)) throw new Error("delete failed");
    },
    onSuccess: () => {
      toast.success("Usuario eliminado");
      setConfirmDelete(false);
      setEditing(null);
      invalidateUsers();
    },
  });

  const createInviteMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(CREATE_INVITE_LINK_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ role: inviteRole }),
      });
      if (await handleGatewayError(res)) throw new Error("create invite failed");
      return (await res.json()) as { invite_token: string; url: string; expires_at: string };
    },
    onSuccess: (data) => {
      setInviteResult({ url: data.url, expires_at: data.expires_at });
      setInviteCopied(false);
    },
  });

  const busy =
    createMutation.isPending || updateMutation.isPending || deactivateMutation.isPending || removeMutation.isPending;

  const openCreate = () => {
    setForm({ email: "", full_name: "", role: "user", company_id: "" });
    setCreateOpen(true);
  };

  const openInvite = () => {
    setInviteRole("user");
    setInviteResult(null);
    setInviteOpen(true);
  };

  const copyInviteUrl = async () => {
    if (!inviteResult) return;
    try {
      await navigator.clipboard.writeText(inviteResult.url);
      setInviteCopied(true);
      toast.success("Link copiado");
      setTimeout(() => setInviteCopied(false), 2000);
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  const create = () => {
    if (!form.email.trim() || !form.full_name.trim()) {
      return toast.error("Email y nombre son requeridos");
    }
    if (form.role !== "admin" && !form.company_id) {
      return toast.error("Empresa requerida");
    }
    createMutation.mutate();
  };

  const openEdit = (u: User) => {
    setEditing(u);
    setEditForm({
      email: u.email ?? "",
      full_name: u.full_name ?? "",
      role: u.role,
      company_id: u.company_id ?? "",
    });
    setEditReactivate(false);
  };

  const update = () => updateMutation.mutate();
  const deactivate = (u: User) => deactivateMutation.mutate(u);
  const remove = () => removeMutation.mutate();

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <PageHeader
          title="Usuarios"
          subtitle="Gestión de usuarios y roles."
          action={
            <div className="flex gap-2">
              <Button variant="outline" onClick={openInvite}>
                <Link2 size={14} className="mr-1" /> Generar link de invitación
              </Button>
              <Button onClick={openCreate}>
                <Plus size={14} className="mr-1" /> Nuevo usuario
              </Button>
            </div>
          }
        />

        <DataTable
          columns={[
            { header: "Nombre", cell: (u) => <span className="font-medium">{u.full_name ?? "—"}</span> },
            { header: "Email", cell: (u) => <span className="text-muted-foreground">{u.email}</span> },
            { header: "Rol", cell: (u) => <RoleBadge role={u.role} /> },
            {
              header: "Empresa / Fondo",
              cell: (u) => (
                <span className="text-muted-foreground">
                  {u.role === "investor" ? (u.fund_name ?? "—") : (u.company_name ?? "—")}
                </span>
              ),
            },
            { header: "Estado", cell: (u) => <StatusBadge isActive={u.is_active} /> },
            {
              header: "Acciones",
              align: "right",
              cellClassName: "whitespace-nowrap",
              cell: (u) => (
                <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                  <Pencil size={12} className="mr-1" /> Editar
                </Button>
              ),
            },
          ]}
          rows={users}
          rowKey={(u) => u.user_id}
          emptyLabel="No hay usuarios todavía."
        />
      </div>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nuevo usuario"
        onSubmit={create}
        submitLabel="Crear"
        busy={busy}
      >
        <div>
          <Label className="text-xs">Email</Label>
          <Input value={form.email} onChange={(e) => setForm({ ...form, email: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Nombre completo</Label>
          <Input value={form.full_name} onChange={(e) => setForm({ ...form, full_name: e.target.value })} className="mt-1" />
        </div>
        <div>
          <Label className="text-xs">Rol</Label>
          <Select value={form.role} onValueChange={(v: Role) => setForm({ ...form, role: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">admin</SelectItem>
              <SelectItem value="user">user</SelectItem>
              <SelectItem value="investor">investor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.role !== "admin" && (
          <div>
            <Label className="text-xs">Empresa</Label>
            <Select value={form.company_id} onValueChange={(v) => setForm({ ...form, company_id: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar empresa" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.company_id} value={c.company_id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
      </FormDialog>

      <FormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Editar usuario"
        footerClassName="sm:justify-between gap-2"
        footer={
          <>
            <div className="flex gap-2">
              {editing && editing.email !== currentEmail && (
                <Button variant="destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>
                  <Trash2 size={14} className="mr-1" /> Eliminar
                </Button>
              )}
              {editing?.is_active && (
                <Button variant="outline" onClick={() => deactivate(editing)} disabled={busy}>
                  Desactivar
                </Button>
              )}
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={update} disabled={busy}>Guardar</Button>
            </div>
          </>
        }
      >
        <div>
          <Label className="text-xs">Email</Label>
          <Input
            type="email"
            value={editForm.email}
            onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Nombre completo</Label>
          <Input
            value={editForm.full_name}
            onChange={(e) => setEditForm({ ...editForm, full_name: e.target.value })}
            className="mt-1"
          />
        </div>
        <div>
          <Label className="text-xs">Rol</Label>
          <Select value={editForm.role} onValueChange={(v: Role) => setEditForm({ ...editForm, role: v })}>
            <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="admin">admin</SelectItem>
              <SelectItem value="user">user</SelectItem>
              <SelectItem value="investor">investor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {editForm.role !== "admin" && (
          <div>
            <Label className="text-xs">Empresa</Label>
            <Select value={editForm.company_id} onValueChange={(v) => setEditForm({ ...editForm, company_id: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar empresa" /></SelectTrigger>
              <SelectContent>
                {companies.map((c) => (
                  <SelectItem key={c.company_id} value={c.company_id}>{c.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        )}
        {editing && !editing.is_active && (
          <div className="flex items-center justify-between">
            <Label className="text-sm">Reactivar</Label>
            <Switch checked={editReactivate} onCheckedChange={setEditReactivate} />
          </div>
        )}
      </FormDialog>

      <FormDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`¿Eliminar ${editing?.full_name ?? editing?.email}?`}
        onSubmit={remove}
        submitLabel="Eliminar"
        submitVariant="destructive"
        busy={busy}
      >
        <div className="text-sm text-muted-foreground">Esta acción no se puede deshacer.</div>
      </FormDialog>

      <FormDialog
        open={inviteOpen}
        onOpenChange={setInviteOpen}
        title="Generar link de invitación"
        description={!inviteResult ? "Elegí el rol con el que se va a unir quien reciba el link." : undefined}
        footer={
          inviteResult ? (
            <Button onClick={() => setInviteOpen(false)}>Cerrar</Button>
          ) : (
            <>
              <Button variant="ghost" onClick={() => setInviteOpen(false)}>Cancelar</Button>
              <Button onClick={() => createInviteMutation.mutate()} disabled={createInviteMutation.isPending}>
                {createInviteMutation.isPending ? "Generando…" : "Generar"}
              </Button>
            </>
          )
        }
      >
        {inviteResult ? (
          <div className="space-y-3">
            <button
              type="button"
              onClick={copyInviteUrl}
              className="w-full text-left px-3 py-2 rounded-md border border-border bg-surface font-mono text-xs break-all flex items-start justify-between gap-2 hover:border-foreground/40 transition-all"
            >
              <span>{inviteResult.url}</span>
              {inviteCopied ? (
                <Check size={14} className="shrink-0 mt-0.5" />
              ) : (
                <Copy size={14} className="shrink-0 mt-0.5 text-muted-foreground" />
              )}
            </button>
            <p className="text-xs text-muted-foreground">
              Vence el {new Date(inviteResult.expires_at).toLocaleString()}.
            </p>
          </div>
        ) : (
          <div>
            <Label className="text-xs">Rol</Label>
            <Select value={inviteRole} onValueChange={(v: "user" | "investor") => setInviteRole(v)}>
              <SelectTrigger className="mt-1"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="user">user (empresa)</SelectItem>
                <SelectItem value="investor">investor (fondo)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </FormDialog>
    </AppLayout>
  );
}