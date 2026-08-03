import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { StatCard } from "@/components/StatCard";
import { DataTable } from "@/components/DataTable";
import { DataTableToolbar } from "@/components/DataTableToolbar";
import { SkeletonSection } from "@/components/SkeletonSection";
import { EmptyState } from "@/components/EmptyState";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { StageBadge } from "@/components/StageBadge";
import { Button } from "@/components/ui/button";
import { Copy, Check, Rocket } from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  name: string;
  stage: string | null;
  business_model: string | null;
  readiness_score: number;
  updated_at: string;
};

export default function Admin() {
  const { isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [loadingRows, setLoadingRows] = useState(true);
  const [search, setSearch] = useState("");

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data: startups } = await supabase
        .from("startups")
        .select("id, name, stage, business_model, readiness_score, updated_at");
      setRows((startups ?? []) as Row[]);
      setLoadingRows(false);
    })();
  }, [isAdmin]);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const filtered = rows.filter((r) => r.name.toLowerCase().includes(search.trim().toLowerCase()));
  const sorted = [...filtered].sort((a, b) => b.readiness_score - a.readiness_score);

  const avgScore = rows.length > 0
    ? Math.round(rows.reduce((acc, r) => acc + r.readiness_score, 0) / rows.length)
    : 0;
  const highScore = rows.filter((r) => r.readiness_score > 70).length;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-8 py-12">
        <InviteSection />
        <PageHeader
          title="Ecosistema CloudValley"
          subtitle="Vista global del portfolio"
          action={
            <Button variant="outline" asChild>
              <Link to="/admin/organizations">Organizaciones →</Link>
            </Button>
          }
        />

        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-10">
          <StatCard label="Total startups" value={rows.length} />
          <StatCard label="Score promedio" value={avgScore} />
          <StatCard label="Score > 70" value={highScore} />
        </div>

        <DataTableToolbar
          search={search}
          onSearchChange={setSearch}
          searchPlaceholder="Buscar startup por nombre…"
        />

        {loadingRows ? (
          <SkeletonSection rows={6} columns={5} />
        ) : (
          <DataTable
            columns={[
              {
                header: "Startup",
                cell: (r) => (
                  <Link to={`/admin/startup/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                ),
              },
              { header: "Etapa", cell: (r) => <StageBadge stage={r.stage} /> },
              {
                header: "Modelo",
                cell: (r) => <span className="text-muted-foreground capitalize">{r.business_model?.replace("_", " ")}</span>,
              },
              {
                header: "Readiness",
                cell: (r) => (
                  <div className="flex items-center gap-2">
                    <span className="tabular-nums">{r.readiness_score}</span>
                    <div className="h-1 w-20 bg-surface rounded-full overflow-hidden">
                      <div className="h-full bg-foreground" style={{ width: `${r.readiness_score}%` }} />
                    </div>
                  </div>
                ),
              },
            ]}
            rows={sorted}
            rowKey={(r) => r.id}
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
