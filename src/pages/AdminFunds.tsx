import { useState } from "react";
import { Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { MembersCell } from "@/components/admin/MembersCell";
import { TablePagination } from "@/components/admin/TablePagination";
import { useTablePage } from "@/hooks/useTablePage";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Checkbox } from "@/components/ui/checkbox";
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
import { Plus, Pencil, Trash2, Search } from "lucide-react";
import { handleGatewayError } from "@/lib/adminGateway";

const LIST_FUNDS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-funds";
const MANAGE_FUNDS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/manage-funds";
const LIST_COMPANIES_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-companies";
const LIST_USERS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-users";

type PortfolioEntry = { company_id: string; company_name: string };
type Fund = {
  fund_id: string;
  name: string;
  is_active: boolean;
  portfolio: PortfolioEntry[];
  // Todavía no confirmado si list-funds ya lo devuelve — se muestra "—" si falta.
  created_at?: string;
};
type Company = { company_id: string; name: string; is_active?: boolean };
type FundUser = {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  fund_id: string | null;
  is_active: boolean;
};
type StatusFilter = "all" | "active" | "inactive";

export default function AdminFunds() {
  const { isAdmin, loading } = useAuth();
  const queryClient = useQueryClient();

  const { data: funds = [] } = useQuery({
    queryKey: ["admin-funds"],
    queryFn: async () => {
      const res = await fetch(LIST_FUNDS_URL, { credentials: "include" });
      if (await handleGatewayError(res)) throw new Error("No se pudo cargar fondos");
      const data = await res.json();
      return (data.funds ?? []) as Fund[];
    },
    enabled: isAdmin,
  });

  const { data: companies = [] } = useQuery({
    queryKey: ["admin-companies"],
    queryFn: async () => {
      const res = await fetch(LIST_COMPANIES_URL, { credentials: "include" });
      if (await handleGatewayError(res)) throw new Error("No se pudo cargar empresas");
      const data = await res.json();
      return (data.companies ?? []) as Company[];
    },
    enabled: isAdmin,
  });

  const { data: users = [] } = useQuery({
    queryKey: ["admin-users"],
    queryFn: async () => {
      const res = await fetch(LIST_USERS_URL, { credentials: "include" });
      if (!res.ok) return [] as FundUser[];
      const data = await res.json();
      return (data.users ?? []) as FundUser[];
    },
    enabled: isAdmin,
  });

  const invalidateFunds = () => queryClient.invalidateQueries({ queryKey: ["admin-funds"] });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const visibleFunds =
    statusFilter === "all" ? funds : funds.filter((f) => f.is_active === (statusFilter === "active"));
  const {
    query: search,
    setQuery: setSearch,
    page,
    setPage,
    totalPages,
    filteredCount,
    pageItems: pagedFunds,
  } = useTablePage(visibleFunds, (f, q) => f.name.toLowerCase().includes(q));

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<Fund | null>(null);
  const [editName, setEditName] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [editPortfolio, setEditPortfolio] = useState<Set<string>>(new Set());
  const [confirmDelete, setConfirmDelete] = useState(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(MANAGE_FUNDS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "create_fund", name: newName.trim() }),
      });
      if (await handleGatewayError(res)) throw new Error("create failed");
    },
    onSuccess: () => {
      toast.success("Fondo creado");
      setNewName("");
      setCreateOpen(false);
      invalidateFunds();
    },
  });

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

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
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
        if (await handleGatewayError(res)) throw new Error("update failed");
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
          if (await handleGatewayError(r)) throw new Error("update portfolio failed");
        }
      }
    },
    onSuccess: () => {
      toast.success("Fondo actualizado");
      setEditing(null);
      invalidateFunds();
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const res = await fetch(MANAGE_FUNDS_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_fund", fund_id: editing.fund_id }),
      });
      if (await handleGatewayError(res)) throw new Error("delete failed");
    },
    onSuccess: () => {
      toast.success("Fondo eliminado");
      setConfirmDelete(false);
      setEditing(null);
      invalidateFunds();
    },
  });

  const busy = createMutation.isPending || updateMutation.isPending || removeMutation.isPending;

  const create = () => {
    if (!newName.trim()) return toast.error("Nombre requerido");
    createMutation.mutate();
  };
  const update = () => updateMutation.mutate();
  const remove = () => removeMutation.mutate();

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <AppLayout>
      <div className="max-w-5xl mx-auto px-8 py-12">
        <PageHeader
          title="Fondos"
          subtitle="Gestión de fondos y su portfolio de empresas."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={14} className="mr-1" /> Nuevo fondo
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar fondo por nombre…"
              className="pl-9 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v: StatusFilter) => setStatusFilter(v)}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              <SelectItem value="active">Activos</SelectItem>
              <SelectItem value="inactive">Inactivos</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DataTable
          columns={[
            { header: "Nombre", cell: (f) => <span className="font-medium">{f.name}</span> },
            { header: "Estado", cell: (f) => <StatusBadge isActive={f.is_active} /> },
            {
              header: "Miembros",
              cell: (f) => <MembersCell members={users.filter((u) => u.fund_id === f.fund_id)} />,
            },
            {
              header: "Portfolio",
              cell: (f) =>
                f.portfolio.length === 0 ? (
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
                ),
            },
            {
              header: "Creado",
              cell: (f) => (
                <span className="text-xs text-muted-foreground">
                  {f.created_at ? new Date(f.created_at).toLocaleDateString("es-AR") : "—"}
                </span>
              ),
            },
            {
              header: "Acciones",
              align: "right",
              cell: (f) => (
                <Button size="sm" variant="ghost" onClick={() => openEdit(f)}>
                  <Pencil size={12} className="mr-1" /> Editar
                </Button>
              ),
            },
          ]}
          rows={pagedFunds}
          rowKey={(f) => f.fund_id}
          emptyLabel="No hay fondos todavía."
        />
        <TablePagination page={page} totalPages={totalPages} totalCount={filteredCount} onPageChange={setPage} />
      </div>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nuevo fondo"
        onSubmit={create}
        submitLabel="Crear"
        busy={busy}
      >
        <Label className="text-xs">Nombre</Label>
        <Input value={newName} onChange={(e) => setNewName(e.target.value)} className="mt-1" />
      </FormDialog>

      <FormDialog
        open={!!editing}
        onOpenChange={(o) => !o && setEditing(null)}
        title="Editar fondo"
        contentClassName="sm:max-w-lg"
        footerClassName="sm:justify-between"
        footer={
          <>
            <Button variant="destructive" onClick={() => setConfirmDelete(true)} disabled={busy}>
              <Trash2 size={14} className="mr-1" /> Eliminar
            </Button>
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setEditing(null)}>Cancelar</Button>
              <Button onClick={update} disabled={busy}>Guardar</Button>
            </div>
          </>
        }
      >
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
      </FormDialog>

      <FormDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`¿Eliminar ${editing?.name}?`}
        onSubmit={remove}
        submitLabel="Eliminar"
        submitVariant="destructive"
        busy={busy}
      >
        <p className="text-sm text-muted-foreground">Esta acción no se puede deshacer.</p>
        <p className="text-sm text-muted-foreground">Los inversores asociados quedarán sin fondo asignado, pero no se eliminan.</p>
      </FormDialog>
    </AppLayout>
  );
}