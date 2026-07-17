import { useEffect, useState } from "react";
import { Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import { Plus, Pencil, Trash2 } from "lucide-react";

const LIST_FUNDS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-funds";
const MANAGE_FUNDS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/manage-funds";
const LIST_COMPANIES_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-companies";

type PortfolioEntry = { company_id: string; company_name: string };
type Fund = { fund_id: string; name: string; is_active: boolean; portfolio: PortfolioEntry[] };
type Company = { company_id: string; name: string; is_active?: boolean };

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

export default function AdminFunds() {
  const { isAdmin, loading } = useAuth();
  const [funds, setFunds] = useState<Fund[]>([]);
  const [companies, setCompanies] = useState<Company[]>([]);
  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<Fund | null>(null);
  const [editName, setEditName] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editPortfolio, setEditPortfolio] = useState<Set<string>>(new Set());
  const [busy, setBusy] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const load = async () => {
    try {
      const res = await fetch(LIST_FUNDS_URL, { credentials: "include" });
      if (await handleError(res)) return;
      const data = await res.json();
      setFunds(data.funds ?? []);
    } catch {
      toast.error("Error al cargar fondos");
    }
  };

  const loadCompanies = async () => {
    try {
      const res = await fetch(LIST_COMPANIES_URL, { credentials: "include" });
      if (await handleError(res)) return;
      const data = await res.json();
      setCompanies(data.companies ?? []);
    } catch {
      toast.error("Error al cargar empresas");
    }
  };

  useEffect(() => {
    if (isAdmin) {
      load();
      loadCompanies();
    }
  }, [isAdmin]);

  const create = async () => {
    if (!newName.trim()) return toast.error("Nombre requerido");
    setBusy(true);
    try {
      const res = await fetch(MANAGE_FUNDS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_fund", name: newName.trim() }),
      });
      if (await handleError(res)) return;
      toast.success("Fondo creado");
      setNewName("");
      setCreateOpen(false);
      load();
    } finally {
      setBusy(false);
    }
  };

  const openEdit = (f: Fund) => {
    setEditing(f);
    setEditName(f.name);
    setEditActive(f.is_active);
    setEditPortfolio(new Set(f.portfolio.map((p) => p.company_id)));
  };

  const togglePortfolio = (companyId: string) => {
    const next = new Set(editPortfolio);
    if (next.has(companyId)) next.delete(companyId);
    else next.add(companyId);
    setEditPortfolio(next);
  };

  const update = async () => {
    if (!editing) return;
    setBusy(true);
    try {
      const nameChanged = editName.trim() !== editing.name;
      const activeChanged = editActive !== editing.is_active;
      if (nameChanged || activeChanged) {
        const res = await fetch(MANAGE_FUNDS_URL, {
          method: "PATCH",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fund_id: editing.fund_id,
            name: editName.trim(),
            is_active: editActive,
          }),
        });
        if (await handleError(res)) return;
      }

      const prevIds = new Set(editing.portfolio.map((p) => p.company_id));
      const toAdd = Array.from(editPortfolio).filter((id) => !prevIds.has(id));
      const toRemove = Array.from(prevIds).filter((id) => !editPortfolio.has(id));

      const ops: Promise<Response>[] = [];
      for (const company_id of toAdd) {
        ops.push(
          fetch(MANAGE_FUNDS_URL, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "add_company", fund_id: editing.fund_id, company_id }),
          })
        );
      }
      for (const company_id of toRemove) {
        ops.push(
          fetch(MANAGE_FUNDS_URL, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "remove_company", fund_id: editing.fund_id, company_id }),
          })
        );
      }
      if (ops.length > 0) {
        const results = await Promise.all(ops);
        for (const r of results) {
          if (await handleError(r)) return;
        }
      }

      toast.success("Fondo actualizado");
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
      const res = await fetch(MANAGE_FUNDS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_fund", fund_id: editing.fund_id }),
      });
      if (await handleError(res)) return;
      toast.success("Fondo eliminado");
      setFunds((prev) => prev.filter((f) => f.fund_id !== editing.fund_id));
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
            <h1 className="text-3xl font-medium tracking-tight">Fondos</h1>
            <p className="text-sm text-muted-foreground mt-1">
              Gestión de fondos y su portfolio de empresas.
            </p>
          </div>
          <Button onClick={() => setCreateOpen(true)}>
            <Plus size={14} className="mr-1" /> Nuevo fondo
          </Button>
        </div>

        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left font-normal px-5 py-3">Nombre</th>
                <th className="text-left font-normal px-5 py-3">Estado</th>
                <th className="text-left font-normal px-5 py-3">Portfolio</th>
                <th className="text-right font-normal px-5 py-3">Acciones</th>
              </tr>
            </thead>
            <tbody>
              {funds.map((f) => (
                <tr
                  key={f.fund_id}
                  className="border-b border-border/50 last:border-0 hover:bg-surface transition-all align-top"
                >
                  <td className="px-5 py-4 font-medium">{f.name}</td>
                  <td className="px-5 py-4"><StatusBadge isActive={f.is_active} /></td>
                  <td className="px-5 py-4">
                    {f.portfolio.length === 0 ? (
                      <span className="text-xs text-muted-foreground">Sin empresas asignadas</span>
                    ) : (
                      <div className="flex flex-wrap gap-1.5">
                        {f.portfolio.map((p) => (
                          <span
                            key={p.company_id}
                            className="inline-flex items-center px-2 py-0.5 rounded-md text-xs bg-surface border border-border"
                          >
                            {p.company_name}
                          </span>
                        ))}
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-4 text-right">
                    <Button size="sm" variant="ghost" onClick={() => openEdit(f)}>
                      <Pencil size={12} className="mr-1" /> Editar
                    </Button>
                  </td>
                </tr>
              ))}
              {funds.length === 0 && (
                <tr>
                  <td colSpan={4} className="text-center py-12 text-muted-foreground">
                    No hay fondos todavía.
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
            <DialogTitle>Nuevo fondo</DialogTitle>
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
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Editar fondo</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label className="text-xs">Nombre</Label>
              <Input value={editName} onChange={(e) => setEditName(e.target.value)} className="mt-1" />
            </div>
            <div className="flex items-center justify-between">
              <Label className="text-sm">{editing?.is_active ? "Activo" : "Reactivar"}</Label>
              <Switch checked={editActive} onCheckedChange={setEditActive} />
            </div>
            <div>
              <Label className="text-xs">Empresas en el portfolio</Label>
              <div className="mt-2 max-h-64 overflow-y-auto border border-border rounded-md divide-y divide-border">
                {companies.length === 0 ? (
                  <div className="p-3 text-xs text-muted-foreground">No hay empresas disponibles.</div>
                ) : (
                  companies.map((c) => (
                    <label
                      key={c.company_id}
                      className="flex items-center gap-2 px-3 py-2 text-sm hover:bg-surface cursor-pointer"
                    >
                      <Checkbox
                        checked={editPortfolio.has(c.company_id)}
                        onCheckedChange={() => togglePortfolio(c.company_id)}
                      />
                      <span>{c.name}</span>
                    </label>
                  ))
                )}
              </div>
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
            <p>Los inversores asociados quedarán sin fondo asignado, pero no se eliminan.</p>
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