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

const LIST_COMPANIES_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-companies";
const MANAGE_COMPANIES_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/manage-companies";
const LIST_USERS_URL = "https://auth-gateway-2rte326z.uc.gateway.dev/list-users";

type Company = {
  company_id: string;
  name: string;
  is_active: boolean;
  // Todavía no confirmado si list-companies ya lo devuelve — se muestra "—" si falta.
  created_at?: string;
};
type CompanyUser = {
  user_id: string;
  email: string;
  full_name: string | null;
  role: string;
  company_id: string | null;
  is_active: boolean;
};
type StatusFilter = "all" | "active" | "inactive";

export default function AdminCompanies() {
  const { isAdmin, loading } = useAuth();
  const queryClient = useQueryClient();

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
      if (!res.ok) return [] as CompanyUser[];
      const data = await res.json();
      return (data.users ?? []) as CompanyUser[];
    },
    enabled: isAdmin,
  });

  const invalidateCompanies = () => queryClient.invalidateQueries({ queryKey: ["admin-companies"] });

  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const visibleCompanies =
    statusFilter === "all" ? companies : companies.filter((c) => c.is_active === (statusFilter === "active"));
  const {
    query: search,
    setQuery: setSearch,
    page,
    setPage,
    totalPages,
    filteredCount,
    pageItems: pagedCompanies,
  } = useTablePage(visibleCompanies, (c, q) => c.name.toLowerCase().includes(q));

  const [createOpen, setCreateOpen] = useState(false);
  const [newName, setNewName] = useState("");
  const [editing, setEditing] = useState<Company | null>(null);
  const [editName, setEditName] = useState("");
  const [editActive, setEditActive] = useState(true);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const createMutation = useMutation({
    mutationFn: async () => {
      const res = await fetch(MANAGE_COMPANIES_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: newName.trim() }),
      });
      if (await handleGatewayError(res)) throw new Error("create failed");
    },
    onSuccess: () => {
      toast.success("Empresa creada");
      setNewName("");
      setCreateOpen(false);
      invalidateCompanies();
    },
  });

  const openEdit = (c: Company) => {
    setEditing(c);
    setEditName(c.name);
    setEditActive(c.is_active);
  };

  const updateMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
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
      if (await handleGatewayError(res)) throw new Error("update failed");
    },
    onSuccess: () => {
      toast.success("Empresa actualizada");
      setEditing(null);
      invalidateCompanies();
    },
  });

  const removeMutation = useMutation({
    mutationFn: async () => {
      if (!editing) return;
      const res = await fetch(MANAGE_COMPANIES_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "delete_company", company_id: editing.company_id }),
      });
      if (await handleGatewayError(res)) throw new Error("delete failed");
    },
    onSuccess: () => {
      toast.success("Empresa eliminada");
      setConfirmDelete(false);
      setEditing(null);
      invalidateCompanies();
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
          title="Empresas"
          subtitle="Gestión de empresas del ecosistema."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={14} className="mr-1" /> Nueva empresa
            </Button>
          }
        />

        <div className="flex flex-wrap items-center gap-2 mb-4">
          <div className="relative flex-1 min-w-[200px]">
            <Search size={14} strokeWidth={1.5} className="absolute left-3 top-1/2 -translate-y-1/2 text-muted-foreground" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Buscar empresa por nombre…"
              className="pl-9 h-9"
            />
          </div>
          <Select value={statusFilter} onValueChange={(v: StatusFilter) => setStatusFilter(v)}>
            <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas</SelectItem>
              <SelectItem value="active">Activas</SelectItem>
              <SelectItem value="inactive">Inactivas</SelectItem>
            </SelectContent>
          </Select>
        </div>

        <DataTable
          columns={[
            { header: "Nombre", cell: (c) => <span className="font-medium">{c.name}</span> },
            {
              header: "Usuarios",
              cell: (c) => <MembersCell members={users.filter((u) => u.company_id === c.company_id)} />,
            },
            {
              header: "Estado",
              cell: (c) => <StatusBadge isActive={c.is_active} activeLabel="Activa" inactiveLabel="Inactiva" />,
            },
            {
              header: "Creada",
              cell: (c) => (
                <span className="text-xs text-muted-foreground">
                  {c.created_at ? new Date(c.created_at).toLocaleDateString("es-AR") : "—"}
                </span>
              ),
            },
            {
              header: "Acciones",
              align: "right",
              cell: (c) => (
                <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                  <Pencil size={12} className="mr-1" /> Editar
                </Button>
              ),
            },
          ]}
          rows={pagedCompanies}
          rowKey={(c) => c.company_id}
          emptyLabel="No hay empresas todavía."
        />
        <TablePagination page={page} totalPages={totalPages} totalCount={filteredCount} onPageChange={setPage} />
      </div>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nueva empresa"
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
        title="Editar empresa"
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
          <Label className="text-sm">{editing?.is_active ? "Activa" : "Reactivar"}</Label>
          <Switch checked={editActive} onCheckedChange={setEditActive} />
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
        <p className="text-sm text-muted-foreground">Los usuarios asociados quedarán sin empresa asignada, pero no se eliminan.</p>
      </FormDialog>
    </AppLayout>
  );
}