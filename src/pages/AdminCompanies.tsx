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
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

const LIST_COMPANIES_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-companies";
const MANAGE_COMPANIES_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/manage-companies";
const LIST_USERS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-users";

type Company = { company_id: string; name: string; is_active: boolean };
type CompanyUser = {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  company_id: string | null;
  is_active: boolean;
};

function StatusBadge({ isActive }: { isActive: boolean }) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium border ${
        isActive
          ? "bg-emerald-100 text-emerald-800 border-emerald-200 dark:bg-emerald-950 dark:text-emerald-300 dark:border-emerald-900"
          : "bg-red-100 text-red-800 border-red-200 dark:bg-red-950 dark:text-red-300 dark:border-red-900"
      }`}
    >
      {isActive ? "Activa" : "Inactiva"}
    </span>
  );
}

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

export default function AdminCompanies() {
  const { isAdmin, loading } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [users, setUsers] = useState<CompanyUser[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<Company | null>(null);
  const [editName, setEditName] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = async () => {
    try {
      const [resC, resU] = await Promise.all([
        fetch(LIST_COMPANIES_URL, { credentials: "include" }),
        fetch(LIST_USERS_URL, { credentials: "include" }),
      ]);
      if (await handleError(resC)) return;
      const dataC = await resC.json();
      setCompanies(dataC.companies ?? []);
      if (resU.ok) {
        const dataU = await resU.json();
        setUsers(dataU.users ?? []);
      }
    } catch {
      toast.error("Error al cargar empresas");
    }
  };

  useEffect(() => {
    if (isAdmin) load();
  }, [isAdmin]);

  const create = async () => {
    if (!newName.trim()) return toast.error("Nombre requerido");
    setBusy(true);
    try {
      const res = await fetch(MANAGE_COMPANIES_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (await handleError(res)) return;
      toast.success("Empresa creada");
      setNewName("");
      setCreateOpen(false);
      load();
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (c: Company) => {
    setEditing(c);
    setEditName(c.name);
    setEditActive(c.is_active);
  };

  const update = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const res = await fetch(MANAGE_COMPANIES_URL, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          company_id: editing.company_id,
          name: editName.trim(),
          is_active: editActive,
        }),
      });
      if (await handleError(res)) return;
      toast.success("Empresa actualizada");
      setEditing(null);
      load();
    } finally {
      setBusy(false);
    }
  };

  const remove = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const res = await fetch(MANAGE_COMPANIES_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_company", company_id: editing.company_id }),
      });
      if (await handleError(res)) return;
      toast.success("Empresa eliminada");
      setCompanies((prev) => prev.filter((c) => c.company_id !== editing.company_id));
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
      <div className="max-w-5xl mx-auto px-8 py-12">
        <div className="flex items-center justify-between mb-8">
          <div>
            <h1 className="text-3xl font-medium tracking-tight">Empresas</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestión de empresas del ecosistema.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={14} className="mr-1" /> Nueva empresa
          </Button>
        </div>

        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left font-normal px-5 py-3">Nombre</th>
                <th className="text-left font-normal px-5 py-3">Usuarios</th>
                <th className="text-left font-normal px-5 py-3">Estado</th>
                <th className="text-right font-normal px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {companies.map((c) => {
                const members = users.filter((u) => u.company_id === c.company_id);
                return (
                <tr key={c.company_id} className="border-b border-border/50 last:border-0 hover:bg-surface transition-all">
                  <td className="px-5 py-4 font-medium">{c.name}</td>
                  <td className="px-5 py-4">
                    {members.length === 0 ? (
                      <span className="text-xs text-muted-foreground">—</span>
                    ) : (
                      <div className="flex flex-wrap gap-1">
                        {members.map((m) => (
                          <span
                            key={m.user_id}
                            title={m.email}
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-xs font-medium bg-muted text-foreground border border-border"
                          >
                            {m.full_name ?? m.email}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4"><StatusBadge isActive={c.is_active} /></td>
                  <td className="px-5 py-4 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                      <Pencil size={12} className="mr-1" /> Editar
                    </Button>
                  </td>
                </tr>
                );
              })}
              {companies.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-muted-foreground">
                    No hay empresas todavía.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </div>

      <Dialog open={createOpen} onOpenChange={setCreateOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Nueva empresa</DialogTitle>
          </DialogHeader>
          <div className="py-2">
            <Label className="text-xs">Nombre</Label>
            <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-1" />
          </div>
          <DialogFooter>
            <Button variant="ghost" onClick={() => setCreateOpen(false)}>Cancelar</Button>
            <Button onClick={create} disabled={busy}>Crear</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Editar empresa</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1" />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">{editing?.is_active ? "Activa" : "Reactivar"}</Label>
              <Switch checked={editActive} onCheckedChange={setEditActive} />
            </div>
          </div>
          <DialogFooter className="sm:justify-between">
            <Button variant="destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>
              <Trash2 size={14} className="mr-1" /> Eliminar
            </Button>
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
            <DialogTitle>¿Eliminar {editing?.name}?</DialogTitle>
          </DialogHeader>
          <div className="py-2 text-sm text-muted-foreground space-y-2">
            <p>Esta acción no se puede deshacer.</p>
            <p>Los usuarios asociados quedarán sin empresa asignada, pero no se eliminan.</p>
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