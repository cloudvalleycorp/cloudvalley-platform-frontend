import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { DataTable } from "@/components/DataTable";
import { DataTableToolbar } from "@/components/DataTableToolbar";
import { SkeletonSection } from "@/components/SkeletonSection";
import { EmptyState } from "@/components/EmptyState";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { useAuth } from "@/contexts/AuthContext";
import { useTablePage } from "@/hooks/useTablePage";
import { handleGatewayError } from "@/lib/adminGateway";
import { LIST_ALL_CONNECTIONS_URL, DECIDE_CONNECTION_URL, type AdminConnection, type ConnectionStatus } from "@/lib/connections";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { toast } from "sonner";
import { Network } from "lucide-react";

type StatusFilter = "all" | ConnectionStatus;

const STATUS_LABEL: Record<ConnectionStatus, string> = {
  pending: "Pendiente",
  connected: "Conectada",
  rejected: "Rechazada",
  cancelled: "Cancelada",
  disconnected: "Desconectada",
};
const STATUS_BADGE: Record<ConnectionStatus, "default" | "secondary" | "destructive" | "success"> = {
  pending: "secondary",
  connected: "success",
  rejected: "destructive",
  cancelled: "secondary",
  disconnected: "secondary",
};

function daysAgo(iso: string): number {
  return Math.floor((Date.now() - new Date(iso).getTime()) / 86_400_000);
}

export default function AdminConnections() {
  const { isAdmin, loading } = useAuth();
  const queryClient = useQueryClient();
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [busyId, setBusyId] = useState<string | null>(null);

  const { data: connections = [], isLoading } = useQuery({
    queryKey: ["admin-all-connections"],
    queryFn: async () => {
      const res = await fetch(LIST_ALL_CONNECTIONS_URL, { credentials: "include" });
      if (await handleGatewayError(res)) throw new Error("No se pudo cargar conexiones");
      const data = await res.json();
      return (data.connections ?? []) as AdminConnection[];
    },
    enabled: isAdmin,
  });

  const invalidate = () => queryClient.invalidateQueries({ queryKey: ["admin-all-connections"] });

  const decide = async (connection_id: string, decision: "approve" | "reject" | "disconnect", successMsg: string) => {
    setBusyId(connection_id);
    try {
      const res = await fetch(DECIDE_CONNECTION_URL, {
        method: "POST",
        credentials: "include",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ connection_id, decision }),
      });
      if (await handleGatewayError(res)) return;
      toast.success(successMsg);
      invalidate();
    } catch {
      toast.error("No se pudo procesar la conexión");
    } finally {
      setBusyId(null);
    }
  };

  const visible = statusFilter === "all" ? connections : connections.filter((c) => c.status === statusFilter);
  const {
    query: search,
    setQuery: setSearch,
    pageItems: pagedConnections,
  } = useTablePage(visible, (c, q) => c.company_name.toLowerCase().includes(q) || c.fund_name.toLowerCase().includes(q));

  const pendingCount = connections.filter((c) => c.status === "pending").length;

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <PageHeader
          title="Conexiones"
          subtitle="Todas las solicitudes entre startups y fondos de la plataforma — antes solo se veían las ya conectadas, fondo por fondo."
        />

        <DataTableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar startup o fondo…"
          filters={
            <Select value={statusFilter} onValueChange={(v: StatusFilter) => setStatusFilter(v)}>
              <SelectTrigger className="w-44 h-9"><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="all">Todas ({connections.length})</SelectItem>
                <SelectItem value="pending">Pendientes ({pendingCount})</SelectItem>
                <SelectItem value="connected">Activas</SelectItem>
                <SelectItem value="rejected">Rechazadas</SelectItem>
                <SelectItem value="cancelled">Canceladas</SelectItem>
                <SelectItem value="disconnected">Desconectadas</SelectItem>
              </SelectContent>
            </Select>
          }
        />

        {isLoading ? (
          <SkeletonSection rows={6} columns={5} />
        ) : (
          <DataTable
            columns={[
              {
                header: "Startup",
                cell: (c) => (
                  <Link to={`/admin/startup/${c.company_id}`} className="font-medium hover:underline">
                    {c.company_name}
                  </Link>
                ),
              },
              {
                header: "Fondo",
                cell: (c) => (
                  <Link to={`/admin/funds/${c.fund_id}`} className="font-medium hover:underline">
                    {c.fund_name}
                  </Link>
                ),
              },
              {
                header: "Estado",
                cell: (c) => (
                  <span className="inline-flex items-center gap-1.5">
                    <Badge variant={STATUS_BADGE[c.status]}>{STATUS_LABEL[c.status]}</Badge>
                    {c.status === "pending" && daysAgo(c.created_at) >= 7 && (
                      <span className="text-[11px] text-warning-dark">hace {daysAgo(c.created_at)} días</span>
                    )}
                  </span>
                ),
              },
              {
                header: "Fecha",
                cell: (c) => (
                  <span className="text-xs text-muted-foreground">{new Date(c.created_at).toLocaleDateString("es-AR")}</span>
                ),
              },
              {
                header: "Acciones",
                align: "right",
                cellClassName: "whitespace-nowrap",
                cell: (c) =>
                  c.status === "pending" ? (
                    <>
                      <Button size="sm" variant="outline" disabled={busyId === c.connection_id} onClick={() => decide(c.connection_id, "approve", "Conexión aprobada")}>
                        Aprobar
                      </Button>
                      <Button size="sm" variant="ghost" disabled={busyId === c.connection_id} onClick={() => decide(c.connection_id, "reject", "Solicitud rechazada")}>
                        Rechazar
                      </Button>
                    </>
                  ) : c.status === "connected" ? (
                    <Button
                      size="sm"
                      variant="ghost"
                      className="text-muted-foreground hover:text-destructive"
                      disabled={busyId === c.connection_id}
                      onClick={() => decide(c.connection_id, "disconnect", "Conexión eliminada")}
                    >
                      Desconectar
                    </Button>
                  ) : (
                    <span className="text-xs text-tertiary">—</span>
                  ),
              },
            ]}
            rows={pagedConnections}
            rowKey={(c) => c.connection_id}
            emptyLabel={
              <EmptyState
                bordered={false}
                icon={Network}
                title="Ninguna conexión coincide."
                description="Probá con otro filtro o buscá por nombre."
              />
            }
          />
        )}
      </div>
    </AppLayout>
  );
}
