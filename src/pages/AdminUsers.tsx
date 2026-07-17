import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

const LIST_USERS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-users";
const MANAGE_USERS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/manage-users";
const LIST_COMPANIES_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-companies";

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

async function handleError(res: Response) {
  if (res.status === 403) {
    toast.error("No autorizado");
    return true;
  }
  if (res.status === 400) {
    try {
      const body = await res.json();
      toast.error(body?.error ?? "Solicitud inválida");
    } catch {
      toast.error("Solicitud inválida");
    }
    return true;
  }
  if (!res.ok) {
    toast.error(`Error ${res.status}`);
    return true;
  }
  return false;
}

function RoleBadge({ role }: { role: Role }) {
  const styles: Record<Role, string> = {
    admin: "bg-purple-100 text-purple-800 border-purple-200 dark:bg-purple-950 dark:text-purple-300 dark:border-purple-900",
    user: "bg-blue-100 text-blue-800 border-blue-200 dark:bg-blue-950 dark:text-blue-300 dark:border-blue-900",
    investor: "bg-amber-100 text-amber-800 border-amber-200 dark:bg-amber-950 dark:text-amber-300 dark:border-amber-900",
  };
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${styles[role]}`}>
      {role}
    </span>
  );
}

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${
        isActive
          ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900"
          : "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900"
      }`}
    >
      {isActive ? "Activo" : "Inactivo"}
    </span>
  );
}

export default function AdminUsers() {
  const { isAdmin, loading, email: currentEmail } = useAuth();
  const [users, setUsers] = useState<User[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
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
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const loadUsers = async () => {
    try {
      const res = await fetch(LIST_USERS_URL, { credentials: "include" });
      if (await handleError(res)) return;
      const data = await res.json();
      setUsers(data.users ?? []);
    } catch {
      toast.error("Error al cargar usuarios");
    }
  };

  const loadCompanies = async () => {
    try {
      const res = await fetch(LIST_COMPANIES_URL, { credentials: "include" });
      if (!res.ok) return;
      const data = await res.json();
      setCompanies(data.companies ?? []);
    } catch {
      /* noop */
    }
  };

  useEffect(() => {
    if (isAdmin) {
      loadUsers();
      loadCompanies();
    }
  }, [isAdmin]);

  const openCreate = () => {
    setForm({ email: "", full_name: "", role: "user", company_id: "" });
    setCreateOpen(true);
  };

  const create = async () => {
    if (!form.email.trim() || !form.full_name.trim()) {
      return toast.error("Email y nombre son requeridos");
    }
    if (form.role !== "admin" && !form.company_id) {
      return toast.error("Empresa requerida");
    }
    setBusy(true);
    try {
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
      if (await handleError(res)) return;
      toast.success("Usuario creado");
      setCreateOpen(false);
      loadUsers();
    } finally {
      setBusy(false);
    }
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

  const update = async () => {
    if (!editing) return;
    setBusy(true);
    try {
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
      if (await handleError(res)) return;
      toast.success("Usuario actualizado");
      setEditing(null);
      loadUsers();
    } finally {
      setBusy(false);
    }
  };

  const deactivate = async (u: User) => {
    setBusy(true);
    try {
      const res = await fetch(MANAGE_USERS_URL, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: u.user_id, is_active: false }),
      });
      if (await handleError(res)) return;
      toast.success("Usuario desactivado");
      setEditing(null);
      loadUsers();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const res = await fetch(MANAGE_USERS_URL, {
        method: "DELETE",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ user_id: editing.user_id }),
      });
      if (await handleError(res)) return;
      toast.success("Usuario eliminado");
      setUsers((prev) => prev.filter((x) => x.user_id !== editing.user_id));
      setConfirmDelete(false);
      setEditing(null);
    } finally {
      setBusy(false);
    }
  };

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-medium tracking-tight">Usuarios</h1>
            <p className="text-sm text-muted-foreground mt-1">Gestión de usuarios y roles.</p>
          </div>
          <Button onClick={openCreate}>
            <Plus size={14} className="mr-1" /> Nuevo usuario
          </Button>
        </div>

        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left font-normal px-5 py-3">Nombre</th>
                <th className="text-left font-normal px-5 py-3">Email</th>
                <th className="text-left font-normal px-5 py-3">Rol</th>
                <th className="text-left font-normal px-5 py-3">Empresa / Fondo</th>
                <th className="text-left font-normal px-5 py-3">Estado</th>
                <th className="text-right font-normal px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.user_id} className="border-b border-border/50 last:border-0 hover:bg-surface transition-all">
                  <td className="px-5 py-4 font-medium">{u.full_name ?? "—"}</td>
                  <td className="px-5 py-4 text-muted-foreground">{u.email}</td>
                  <td className="px-5 py-4"><RoleBadge role={u.role} /></td>
                  <td className="px-5 py-4 text-muted-foreground">
                    {u.role === "investor"
                      ? (u.fund_name ?? "—")
                      : (u.company_name ?? "—")}
                  </td>
                  <td className="px-5 py-4"><StatusBadge isActive={u.is_active} /></td>
                  <td className="px-5 py-4 text-right whitespace-nowrap">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(u)}>
                      <Pencil size={12} className="mr-1" /> Editar
                    </Button>
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="text-center py-12 text-muted-foreground">
                    No hay usuarios todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Crear */}
      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nuevo usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
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
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={create} disabled={busy}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Editar */}
      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar usuario</DialogTitle>
          </DialogHeader>
          <div className="space-y-3 py-2">
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
          </div>
          <DialogFooter className="sm:justify-between gap-2">
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
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={confirmDelete} onOpenChange={setConfirmDelete}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>¿Eliminar {editing?.full_name ?? editing?.email}?</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground">
            Esta acción no se puede deshacer.
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setConfirmDelete(false)}>Cancelar</Button>
            <Button variant="destructive" onClick={remove} disabled={busy}>Eliminar</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </AppLayout>
  );
}