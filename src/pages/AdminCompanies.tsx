import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { DataTableToolbar } from "@/components/DataTableToolbar";
import { SkeletonSection } from "@/components/SkeletonSection";
import { EmptyState } from "@/components/EmptyState";
import { MembersCell } from "@/components/admin/MembersCell";
import { TablePagination } from "@/components/admin/TablePagination";
import { useTablePage } from "@/hooks/useTablePage";
import { useAuth } from "@/contexts/AuthContext";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { FormDialog } from "@/components/FormDialog";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { StatusBadge } from "@/components/StatusBadge";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Plus, Pencil, Trash2, Building2, Link2 } from "lucide-react";
import { handleGatewayError } from "@/lib/adminGateway";
import { API_BASE_URL } from "@/lib/apiConfig";
import { useResendAccess } from "@/hooks/useResendAccess";

const LIST_COMPANIES_URL = `${API_BASE_URL}/list-companies`;
const MANAGE_COMPANIES_URL = `${API_BASE_URL}/manage-companies`;
const LIST_USERS_URL = `${API_BASE_URL}/list-users`;

type Company = {
  company_id: string;
  name: string;
  is_active: boolean;
  // Puede venir null en entidades viejas creadas antes de que este campo existiera.
  created_at: string | null;
  // Confirmado y desplegado 2026-09-21 (Bloque 5) — reemplaza a la
  // impersonación descartada: 2 cuentas reales marcadas así, para
  // pruebas/demos, excluidas de list-global-activity/list-platform-kpis.
  is_demo: boolean;
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

  const { data: companies = [], isLoading: companiesLoading } = useQuery({
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
  const [editDemo, setEditDemo] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  // Reenviar acceso (Fase 6, backend confirmado 2026-09-21) — a TODOS los
  // miembros activos de la empresa, no un usuario puntual (eso vive en
  // AdminUsers.tsx).
  const { resendAccess, sending: resendingAccess } = useResendAccess();
  const [resendTarget, setResendTarget] = useState<Company | null>(null);
  const confirmResendAccess = async () => {
    if (!resendTarget) return;
    const ok = await resendAccess({ company_id: resendTarget.company_id });
    if (ok) setResendTarget(null);
  };

  // Acciones en bloque (Fase 8 del plan de Admin) — desactivar usa el batch
  // real confirmado 2026-09-21 (Bloque 8: PATCH manage-companies con
  // company_ids + is_active, devuelve {results:[{id,success,error?}]} — se
  // revisa fila por fila, nunca se asume éxito total por el 200). Eliminar
  // sigue con Promise.all porque el batch no cubre delete.
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [confirmBulkDelete, setConfirmBulkDelete] = useState(false);
  const [bulkBusy, setBulkBusy] = useState(false);
  const bulkDeactivate = async () => {
    setBulkBusy(true);
    try {
      const res = await fetch(MANAGE_COMPANIES_URL, {
        method: "PATCH",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ company_ids: Array.from(selected), is_active: false }),
      });
      if (await handleGatewayError(res)) return;
      const data = (await res.json()) as { results: { id: string; success: boolean; error?: string }[] };
      const failed = data.results.filter((r) => !r.success);
      const okCount = data.results.length - failed.length;
      if (okCount > 0) toast.success(`${okCount} empresa${okCount === 1 ? "" : "s"} desactivada${okCount === 1 ? "" : "s"}`);
      if (failed.length > 0) toast.error(`${failed.length} no se pudo${failed.length === 1 ? "" : "n"} desactivar`);
      setSelected(new Set());
      invalidateCompanies();
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
        Array.from(selected).map((company_id) =>
          fetch(MANAGE_COMPANIES_URL, {
            method: "POST",
            credentials: "include",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "delete_company", company_id }),
          })
        )
      );
      toast.success(`${selected.size} empresa${selected.size === 1 ? "" : "s"} eliminada${selected.size === 1 ? "" : "s"}`);
      setSelected(new Set());
      setConfirmBulkDelete(false);
      invalidateCompanies();
    } catch {
      toast.error("No se pudo eliminar el bloque completo");
    } finally {
      setBulkBusy(false);
    }
  };

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
    setEditDemo(c.is_demo);
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
          is_demo: editDemo,
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
      <div className="max-w-6xl mx-auto px-8 py-12">
        <PageHeader
          title="Empresas"
          subtitle="Gestión de empresas del ecosistema."
          action={
            <Button onClick={() => setCreateOpen(true)}>
              <Plus size={14} className="mr-1" /> Nueva empresa
            </Button>
          }
        />

        <DataTableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar empresa por nombre…"
          filters={
            <Select value={statusFilter} onValueChange={(v: StatusFilter) => setStatusFilter(v)}>
              <SelectTrigger className="w-40 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas</SelectItem>
                <SelectItem value="active">Activas</SelectItem>
                <SelectItem value="inactive">Inactivas</SelectItem>
              </SelectContent>
            </Select>
          }
        />

        {selected.size > 0 && (
          <div className="flex items-center gap-3 rounded-lg border border-primary/30 bg-primary-subtle px-4 py-2.5 mb-3">
            <span className="text-sm font-medium text-primary-dark flex-1">
              {selected.size} empresa{selected.size === 1 ? "" : "s"} seleccionada{selected.size === 1 ? "" : "s"}
            </span>
            <Button size="sm" variant="outline" onClick={bulkDeactivate} disabled={bulkBusy}>
              Desactivar
            </Button>
            <Button size="sm" variant="destructive" onClick={() => setConfirmBulkDelete(true)} disabled={bulkBusy}>
              Eliminar
            </Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())} disabled={bulkBusy}>
              Cancelar
            </Button>
          </div>
        )}

        {companiesLoading ? (
          <SkeletonSection rows={5} columns={5} />
        ) : (
          <>
            <DataTable
              selectable
              selectedKeys={selected}
              onSelectionChange={setSelected}
              columns={[
                {
                  header: "Nombre",
                  cell: (c) => (
                    <Link to={`/admin/startup/${c.company_id}`} className="font-medium inline-flex items-center gap-1.5 hover:underline">
                      {c.name}
                      {c.is_demo && (
                        <span className="text-[10px] font-semibold uppercase tracking-wide px-1.5 py-0.5 rounded-full bg-teal-subtle text-teal-dark">
                          Demo
                        </span>
                      )}
                    </Link>
                  ),
                },
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
                  cellClassName: "whitespace-nowrap",
                  cell: (c) => (
                    <>
                      <Button
                        size="sm"
                        variant="ghost"
                        onClick={() => setResendTarget(c)}
                        aria-label={`Reenviar acceso a ${c.name}`}
                        title="Reenviar acceso"
                      >
                        <Link2 size={12} />
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>
                        <Pencil size={12} className="mr-1" /> Editar
                      </Button>
                    </>
                  ),
                },
              ]}
              rows={pagedCompanies}
              rowKey={(c) => c.company_id}
              emptyLabel={
                <EmptyState
                  bordered={false}
                  icon={Building2}
                  title="No hay empresas todavía."
                  description="Cuando se cree una empresa en el ecosistema, va a aparecer acá."
                  action={{ label: "Nueva empresa", onClick: () => setCreateOpen(true) }}
                />
              }
            />
            <TablePagination page={page} totalPages={totalPages} totalCount={filteredCount} onPageChange={setPage} />
          </>
        )}
      </div>

      <FormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        title="Nueva empresa"
        description="Se crea activa y sin usuarios asignados todavía."
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
        description="Cambiá el nombre, activala o desactivala, o marcala como cuenta demo."
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
        <div className="flex items-center justify-between">
          <div>
            <Label className="text-sm">Cuenta demo</Label>
            <p className="text-xs text-muted-foreground">Para pruebas/demos — excluida de KPIs y actividad real.</p>
          </div>
          <Switch checked={editDemo} onCheckedChange={setEditDemo} />
        </div>
      </FormDialog>

      <ConfirmationDialog
        open={!!resendTarget}
        onOpenChange={(o) => !o && setResendTarget(null)}
        title={`¿Reenviar acceso a todos los miembros de ${resendTarget?.name}?`}
        description="Cada miembro activo de esta empresa recibe un magic link real por email."
        confirmLabel="Reenviar"
        onConfirm={confirmResendAccess}
        busy={resendingAccess}
      />

      <ConfirmationDialog
        open={confirmDelete}
        onOpenChange={setConfirmDelete}
        title={`¿Eliminar ${editing?.name}?`}
        description="Esta acción no se puede deshacer. Los usuarios asociados quedarán sin empresa asignada, pero no se eliminan."
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={remove}
        busy={busy}
      />

      <ConfirmationDialog
        open={confirmBulkDelete}
        onOpenChange={setConfirmBulkDelete}
        title={`¿Eliminar ${selected.size} empresa${selected.size === 1 ? "" : "s"}?`}
        description="Esta acción no se puede deshacer. Los usuarios asociados quedarán sin empresa asignada, pero no se eliminan."
        confirmLabel="Eliminar"
        variant="destructive"
        onConfirm={bulkDelete}
        busy={bulkBusy}
      />
    </AppLayout>
  );
}