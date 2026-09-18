import { useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { DataTable } from "@/components/DataTable";
import { DataTableToolbar } from "@/components/DataTableToolbar";
import { SkeletonSection } from "@/components/SkeletonSection";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { API_BASE_URL } from "@/lib/apiConfig";
import { Button } from "@/components/ui/button";
import { Copy, Check, Rocket } from "lucide-react";
import { toast } from "sonner";

const LIST_COMPANIES_URL = `${API_BASE_URL}/list-companies`;

// Mismo endpoint real que ya usa AdminCompanies.tsx — antes esta pantalla
// leía la tabla "startups" de Supabase directo (etapa/modelo/readiness_score
// incluidos). Esos datos quedaron abandonados (no se migran, decisión
// explícita 2026-09-08): esta pantalla ahora solo muestra lo que
// list-companies devuelve de verdad. Si en algún momento hace falta
// etapa/modelo/readiness por company acá, es un endpoint nuevo a pedir — no
// hay forma de traerlo hoy sin una llamada aparte por company (N+1 real por
// cada carga de esta pantalla, no vale la pena hasta que exista un bulk
// endpoint para esto).
type Company = { company_id: string; name: string; is_active: boolean; created_at: string | null };

export default function Admin() {
  const { isAdmin, loading } = useAuth();
  const [search, setSearch] = useState("");

  const { data: companies = [], isLoading: loadingRows } = useQuery({
    queryKey: ["admin-ecosystem-companies"],
    queryFn: async () => {
      const res = await fetch(LIST_COMPANIES_URL, { credentials: "include" });
      if (!res.ok) return [] as Company[];
      const data = await res.json();
      return (data.companies ?? []) as Company[];
    },
    enabled: isAdmin,
  });

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const filtered = companies.filter((c) => c.name.toLowerCase().includes(search.trim().toLowerCase()));
  const sorted = [...filtered].sort((a, b) => a.name.localeCompare(b.name));
  const activeCount = companies.filter((c) => c.is_active).length;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <InviteSection />
        <PageHeader
          title="Ecosistema CloudValley"
          subtitle="Vista global del portfolio"
          action={
            <Button variant="outline" asChild>
              <Link to="/admin/funds">Fondos →</Link>
            </Button>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-10">
          <StatCard label="Total startups" value={companies.length} />
          <StatCard label="Activas" value={activeCount} />
        </div>

        <DataTableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar startup por nombre…"
        />

        {loadingRows ? (
          <SkeletonSection rows={6} columns={3} />
        ) : (
          <DataTable
            columns={[
              {
                header: "Startup",
                cell: (c) => (
                  <Link to={`/admin/startup/${c.company_id}`} className="font-medium hover:underline">{c.name}</Link>
                ),
              },
              {
                header: "Estado",
                cell: (c) => (
                  <span className={c.is_active ? "text-success-dark" : "text-muted-foreground"}>
                    {c.is_active ? "Activa" : "Inactiva"}
                  </span>
                ),
              },
              {
                header: "Creada",
                cell: (c) => (
                  <span className="text-muted-foreground">
                    {c.created_at ? new Date(c.created_at).toLocaleDateString("es-AR") : "—"}
                  </span>
                ),
              },
            ]}
            rows={sorted}
            rowKey={(c) => c.company_id}
            emptyLabel={
              <EmptyState
                bordered={false}
                icon={Rocket}
                title={search ? "Ninguna startup coincide con la búsqueda." : "No hay startups todavía."}
                description={
                  search
                    ? "Probá con otro nombre."
                    : "Cuando una startup se sume al ecosistema, va a aparecer acá."
                }
              />
            }
          />
        )}
      </div>
    </AppLayout>
  );
}

function InviteRow({
  role,
  label,
  copied,
  onCopy,
}: {
  role: "user" | "investor";
  label: string;
  copied: "user" | "investor" | null;
  onCopy: (role: "user" | "investor") => void;
}) {
  const url = `${window.location.origin}/onboarding?role=${role}`;
  return (
    <div className="flex items-center gap-3 py-2">
      <Button variant="outline" size="sm" onClick={() => onCopy(role)}>
        {copied === role ? (
          <><Check size={14} strokeWidth={1.5} className="mr-1.5" /> Copiado</>
        ) : (
          <><Copy size={14} strokeWidth={1.5} className="mr-1.5" /> {label}</>
        )}
      </Button>
      <code className="text-xs text-muted-foreground truncate">{url}</code>
    </div>
  );
}

function InviteSection() {
  const [copied, setCopied] = useState<"user" | "investor" | null>(null);

  const copy = async (role: "user" | "investor") => {
    const url = `${window.location.origin}/onboarding?role=${role}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(role);
      toast.success("Link copiado");
      setTimeout(() => setCopied((c) => (c === role ? null : c)), 2000);
    } catch {
      toast.error("No se pudo copiar el link");
    }
  };

  return (
    <div className="mb-8 border border-border rounded-lg p-5 bg-card">
      <h2 className="text-sm font-medium text-foreground">Invitar</h2>
      <p className="text-xs text-muted-foreground mt-1">
        Copiá el link y compartilo por fuera (email, WhatsApp, etc).
      </p>
      <div className="mt-3 divide-y divide-border/50">
        <InviteRow role="user" label="Invitar usuario" copied={copied} onCopy={copy} />
        <InviteRow role="investor" label="Invitar inversor" copied={copied} onCopy={copy} />
      </div>
    </div>
  );
}
