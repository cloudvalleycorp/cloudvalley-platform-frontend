import { useMemo, useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { DataTableToolbar } from "@/components/DataTableToolbar";
import { SkeletonSection } from "@/components/SkeletonSection";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormDialog } from "@/components/FormDialog";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { StatusBadge } from "@/components/StatusBadge";
import { RoleBadge } from "@/components/RoleBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Link2, Copy, Check, Users as UsersIcon } from "lucide-react";
import { handleGatewayError } from "@/lib/adminGateway";
import { API_BASE_URL } from "@/lib/apiConfig";
import { useResendAccess } from "@/hooks/useResendAccess";

const LIST_USERS_URL = `${API_BASE_URL}/list-users`;
const MANAGE_USERS_URL = `${API_BASE_URL}/manage-users`;
const LIST_COMPANIES_URL = `${API_BASE_URL}/list-companies`;
const LIST_FUNDS_URL = `${API_BASE_URL}/list-funds`;
const CREATE_INVITE_LINK_URL = `${API_BASE_URL}/create-invite-link`;

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
  // Confirmado y desplegado 2026-09-21 (Bloque 3) — last_login_at en null
  // es normal para cuentas viejas que no volvieron a loguearse desde que se
  // agregó el campo, no es un bug.
  created_at: string | null;
  last_login_at: string | null;
};

type Company = { company_id: string; name: string; is_demo?: boolean };
type Fund = { fund_id: string; name: string; is_demo?: boolean };

export default function AdminUsers() {
  const { isAdmin, loading, email: currentEmail } = useAuth();
  const queryClient = useQueryClient();

  const { data: users = [], isLoading: usersLoading } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch(LIST_USERS_URL, { credentials: "include" });
      if (await handleGatewayError(res)) throw new Error("No se pudo cargar usuarios");
      const data = await res.json();
      return (data.users ?? []) as User[];
    },
    enabled: isAdmin,
  });

  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState<"all" | Role>("all");
  const visibleUsers = useMemo(
    () =>
      users.filter((u) => {
        if (roleFilter !== "all" && u.role !== roleFilter) return false;
        const q = search.trim().toLowerCase();
        if (!q) return true;
        return (u.full_name ?? "").toLowerCase().includes(q) || u.email.toLowerCase().includes(q);
      }),
    [users, search, roleFilter]
  );

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

  const { data: funds = [] } = useQuery({
    queryKey: ["admin-funds"],
    queryFn: async () => {
      const res = await fetch(LIST_FUNDS_URL, { credentials: "include" });
      if (!res.ok) return [] as Fund[];
      const data = await res.json();
      return (data.funds ?? []) as Fund[];
    },
    enabled: isAdmin,
  });

  // is_demo vive en company/fund (Bloque 5), no en el usuario — se resuelve
  // acá para poder mostrar el badge "Demo" en la fila de usuario.
  const demoCompanyIds = useMemo(() => new Set(companies.filter((c) => c.is_demo).map((c) => c.company_id)), [companies]);
  const demoFundIds = useMemo(() => new Set(funds.filter((f) => f.is_demo).map((f) => f.fund_id)), [funds]);
  const isDemoUser = (u: User) =>
    (u.company_id && demoCompanyIds.has(u.company_id)) || (u.fund_id && demoFundIds.has(u.fund_id));

  const invalidateUsers = () => queryClient.invalidateQueries({ queryKey: ["admin-users"] });

  const [createOpen, setCreateOpen] = useState(false);
  const [form, setForm] = useState<{ email: string; full_name: string; role: Role; company_id: string; fund_id: string }>({
    email: "",
    full_name: "",
    role: "user",
    company_id: "",
    fund_id: "",
  });
  const [editing, setEditing] = useState<User | null>(null);
  const [editForm, setEditForm] = useState<{ email: string; full_name: string; role: Role; company_id: string; fund_id: string }>({
    email: "",
    full_name: "",
    role: "user",
    company_id: "",
    fund_id: "",
  });
  const [editReactivate, setEditReactivate] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Acciones en bloque (Fase 8 del plan de Admin). Desactivar usa el batch
  // real confirmado 2026-09-21 (Bloque 8: PATCH manage-users con user_ids +
  // is_active, devuelve {results:[{id,success,error?}]} — nunca se asume
  // éxito total solo por el 200, se revisa results fila por fila). Eliminar
  // sigue con Promise.all porque el batch NO cubre delete, solo is_active.
  // Nunca incluye la propia cuenta del admin logueado, mismo criterio que ya
  // aplica "Eliminar" fila por fila (editing.email !== currentEmail).
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkTargetIds = useMemo(
    () => Array.from(selected).filter((id) => users.find((u) => u.user_id === id)?.email !== currentEmail),
    [selected, users, currentEmail]
  );
  const bulkDeactivate = async () => {
    setBulkBusy(true);
    try {
      const res = await fetch(MANAGE_USERS_URL, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_ids: bulkTargetIds, is_active: false }),
      });
      if (await handleGatewayError(res)) return;
      const data = (await res.json()) as { results: { id: string; success: boolean; error?: string }[] };
      const failed = data.results.filter((r) => !r.success);
      const okCount = data.results.length - failed.length;
      if (okCount > 0) toast.success(`${okCount} usuario${okCount === 1 ? "" : "s"} desactivado${okCount === 1 ? "" : "s"}`);
      if (failed.length > 0) toast.error(`${failed.length} no se pudo${failed.length === 1 ? "" : "n"} desactivar`);
      setSelected(new Set());
      invalidateUsers();
    } catch {
      toast.error("No se pudo desactivar el bloque completo");
    } finally {
      setBulkBusy(false);
    }
  };
  const bulkDelete = async () => {
    setBulkBusy(true);
    try {
      await Promise.all(
        bulkTargetIds.map((user_id) =>
          fetch(MANAGE_USERS_URL, {
            method: "DELETE",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ user_id }),
          })
        )
      );
      toast.success(`${bulkTargetIds.length} usuario${bulkTargetIds.length === 1 ? "" : "s"} eliminado${bulkTargetIds.length === 1 ? "" : "s"}`);
      setSelected(new Set());
      setConfirmBulkDelete(false);
      invalidateUsers();
    } catch {
      toast.error("No se pudo eliminar el bloque completo");
    } finally {
      setBulkBusy(false);
    }
  };

  // Reenviar acceso (Fase 6, backend confirmado 2026-09-21) — un solo
  // ConfirmationDialog reusado para el caso "un usuario puntual" de esta
  // pantalla.
  const { resendAccess, sending: resendingAccess } = useResendAccess();
  const [resendTarget, setResendTarget] = useState<User | null>(null);
  const confirmResendAccess = async () => {
    if (!resendTarget) return;
    const ok = await resendAccess({ user_id: resendTarget.user_id });
    if (ok) setResendTarget(null);
  };

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
          company_id: form.role === "user" ? form.company_id : null,
          fund_id: form.role === "investor" ? form.fund_id : null,
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
        company_id: editForm.role === "user" ? editForm.company_id || null : null,
        fund_id: editForm.role === "investor" ? editForm.fund_id || null : null,
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
    setForm({ email: "", full_name: "", role: "user", company_id: "", fund_id: "" });
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
    if (form.role === "user" && !form.company_id) {
      return toast.error("Empresa requerida");
    }
    if (form.role === "investor" && !form.fund_id) {
      return toast.error("Fondo requerido");
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
      fund_id: u.fund_id ?? "",
    });
    setEditReactivate(false);
  };

  const update = () => {
    if (editForm.role === "user" && !editForm.company_id) {
      return toast.error("Empresa requerida");
    }
    if (editForm.role === "investor" && !editForm.fund_id) {
      return toast.error("Fondo requerido");
    }
    updateMutation.mutate();
  };
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
            <>
              <Button variant="outline" onClick={openInvite}>
                <Link2 size={14} className="mr-1" /> Generar link de invitación
              </Button>
              <Button onClick={openCreate}>
                <Plus size={14} className="mr-1" /> Nuevo usuario
              </Button>
            </>
          }
        />

        <DataTableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar por nombre o email…"
          filters={
            <Select value={roleFilter} onValueChange={(v: "all" | Role) => setRoleFilter(v)}>
              <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todos los roles</SelectItem>
                <SelectItem value="admin">Admin</SelectItem>
                <SelectItem value="user">Usuario</SelectItem>
                <SelectItem value="investor">Inversor</SelectItem>
              </SelectContent>
            </Select>
          }
        />

        {selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary-subtle px-4 py-2.5 mb-3">
            <span className="text-sm font-medium text-primary-dark flex-1">
              {selected.size} usuario{selected.size === 1 ? "" : "s"} seleccionado{selected.size === 1 ? "" : "s"}
            </span>
            <Button size="sm" variant="outline" onClick={bulkDeactivate} disabled={bulkBusy || bulkTargetIds.length === 0}>
              Desactivar
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setConfirmBulkDelete(true)} disabled={bulkBusy || bulkTargetIds.length === 0}>
              Eliminar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={bulkBusy}>
              Cancelar
            </Button>
          </div>
        )}

        {usersLoading ? (
          <SkeletonSection rows={6} columns={8} />
        ) : (
          <DataTable
            selectable
            selectedKeys={selected}
            onSelectionChange={setSelected}
            columns={[
              {
                header: "Nombre",
                cell: (u) => (
                  <span className="font-medium inline-flex items-center gap-1.5">
                    {u.full_name ?? "—"}
                    {isDemoUser(u) && (
                      <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-teal-subtle text-teal-dark">
                        Demo
                      </span>
                    )}
                  </span>
                ),
              },
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
                header: "Se unió",
                cell: (u) => (
                  <span className="text-xs text-muted-foreground">
                    {u.created_at ? new Date(u.created_at).toLocaleDateString("es-AR") : "—"}
                  </span>
                ),
              },
              {
                header: "Último acceso",
                cell: (u) => (
                  <span className="text-xs text-muted-foreground">
                    {u.last_login_at ? new Date(u.last_login_at).toLocaleDateString("es-AR") : "Nunca"}
                  </span>
                ),
              },
              {
                header: "Acciones",
                align: "right",
                cellClassName: "whitespace-nowrap",
                cell: (u) => (
                  <>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => setResendTarget(u)}
                      aria-label={`Reenviar acceso a ${u.full_name ?? u.email}`}
                      title="Reenviar acceso"
                    >
                      <Link2 size={12} />
                    </Button>
                    <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                      <Pencil size={12} className="mr-1" /> Editar
                    </Button>
                  </>
                ),
              },
            ]}
            rows={visibleUsers}
            rowKey={(u) => u.user_id}
            emptyLabel={
              <EmptyState
                bordered={false}
                icon={UsersIcon}
                title={search || roleFilter !== "all" ? "Ningún usuario coincide con el filtro." : "No hay usuarios todavía."}
                description={
                  search || roleFilter !== "all"
                    ? "Probá con otro nombre, email o rol."
                    : "Cuando se cree un usuario, va a aparecer acá."
                }
                action={{ label: "Nuevo usuario", onClick: openCreate }}
              />
            }
          />
        )}
      </div>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nuevo usuario"
        description="Elegí el rol y, si corresponde, la empresa o el fondo al que pertenece."
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
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="user">Usuario</SelectItem>
              <SelectItem value="investor">Inversor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {form.role === "user" && (
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
        {form.role === "investor" && (
          <div>
            <Label className="text-xs">Fondo</Label>
            <Select value={form.fund_id} onValueChange={(v) => setForm({ ...form, fund_id: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar fondo" /></SelectTrigger>
              <SelectContent>
                {funds.map((f) => (
                  <SelectItem key={f.fund_id} value={f.fund_id}>{f.name}</SelectItem>
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
        description="Cambiá sus datos, reasigná su rol o moveló de empresa/fondo."
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
              <SelectItem value="admin">Admin</SelectItem>
              <SelectItem value="user">Usuario</SelectItem>
              <SelectItem value="investor">Inversor</SelectItem>
            </SelectContent>
          </Select>
        </div>
        {editForm.role === "user" && (
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
        {editForm.role === "investor" && (
          <div>
            <Label className="text-xs">Fondo</Label>
            <Select value={editForm.fund_id} onValueChange={(v) => setEditForm({ ...editForm, fund_id: v })}>
              <SelectTrigger className="mt-1"><SelectValue placeholder="Seleccionar fondo" /></SelectTrigger>
              <SelectContent>
                {funds.map((f) => (
                  <SelectItem key={f.fund_id} value={f.fund_id}>{f.name}</SelectItem>
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

      <ConfirmationDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`¿Eliminar ${editing?.full_name ?? editing?.email}?`}
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={remove}
        busy={busy}
      />

      <ConfirmationDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`¿Eliminar ${bulkTargetIds.length} usuario${bulkTargetIds.length === 1 ? "" : "s"}?`}
        description="Esta acción no se puede deshacer."
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={bulkDelete}
        busy={bulkBusy}
      />

      <ConfirmationDialog
        open={!!resendTarget}
        onOpenChange={(o) => !o && setResendTarget(null)}
        title={`¿Reenviar acceso a ${resendTarget?.full_name ?? resendTarget?.email}?`}
        description="Se le manda un magic link real por email para que pueda volver a entrar."
        confirmLabel="Reenviar"
        onConfirm={confirmResendAccess}
        busy={resendingAccess}
      />

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
                <SelectItem value="user">Usuario (empresa)</SelectItem>
                <SelectItem value="investor">Inversor (fondo)</SelectItem>
              </SelectContent>
            </Select>
          </div>
        )}
      </FormDialog>
    </AppLayout>
  );
}