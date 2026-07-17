import { useEffect, useState } from "react";
import { Link, Navigate } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { StageBadge } from "@/components/StageBadge";
import { Button } from "@/components/ui/button";
import { Copy, Check } from "lucide-react";
import { toast } from "sonner";

type Row = {
  id: string;
  name: string;
  stage: string | null;
  business_model: string | null;
  readiness_score: number;
  mrr: number | null;
  runway: number | null;
  updated_at: string;
};

export default function Admin() {
  const { isAdmin, loading } = useAuth();
  const [rows, setRows] = useState<Row[]>([]);
  const [sortBy, setSortBy] = useState<"score" | "mrr">("score");

  useEffect(() => {
    if (!isAdmin) return;
    (async () => {
      const { data: startups } = await supabase
        .from("startups")
        .select("id, name, stage, business_model, readiness_score, updated_at");

      // TODO: migrar a backend propio
      const { data: mrrDef } = await supabase.from("metric_definitions")
        .select("id").eq("name", "MRR").maybeSingle();
      // TODO: migrar a backend propio
      const { data: runwayDef } = await supabase.from("metric_definitions")
        .select("id").eq("name", "Runway").maybeSingle();

      const enriched: Row[] = [];
      for (const s of startups ?? []) {
        let mrr: number | null = null, runway: number | null = null;
        if (mrrDef) {
          // TODO: migrar a backend propio
          const { data } = await supabase.from("metric_entries")
            .select("value").eq("startup_id", s.id).eq("metric_id", mrrDef.id)
            .order("period_year", { ascending: false }).order("period_month", { ascending: false }).limit(1);
          mrr = data?.[0] ? Number(data[0].value) : null;
        }
        if (runwayDef) {
          // TODO: migrar a backend propio
          const { data } = await supabase.from("metric_entries")
            .select("value").eq("startup_id", s.id).eq("metric_id", runwayDef.id)
            .order("period_year", { ascending: false }).order("period_month", { ascending: false }).limit(1);
          runway = data?.[0] ? Number(data[0].value) : null;
        }
        enriched.push({ ...s, mrr, runway } as Row);
      }
      setRows(enriched);
    })();
  }, [isAdmin]);

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  const sorted = [...rows].sort((a, b) =>
    sortBy === "score" ? b.readiness_score - a.readiness_score : (b.mrr ?? 0) - (a.mrr ?? 0)
  );

  const avgScore = rows.length > 0
    ? Math.round(rows.reduce((acc, r) => acc + r.readiness_score, 0) / rows.length)
    : 0;
  const highScore = rows.filter((r) => r.readiness_score > 70).length;

  return (
    <AppLayout>
      <div className="max-w-7xl mx-auto px-8 py-12">
        <InviteSection />
        <div className="flex items-start justify-between mb-8">
          <div>
            <h1 className="text-3xl font-medium tracking-tight mb-2">Ecosistema CloudValley</h1>
            <p className="text-sm text-muted-foreground">Vista global del portfolio</p>
          </div>
          <Link
            to="/admin/organizations"
            className="text-sm px-3 py-2 border border-border rounded-md hover:bg-surface transition-all"
          >
            Organizaciones →
          </Link>
        </div>

        <div className="grid grid-cols-3 gap-4 mb-10">
          <Stat label="Total startups" value={rows.length} />
          <Stat label="Score promedio" value={avgScore} />
          <Stat label="Score > 70" value={highScore} />
        </div>

        <div className="border border-border rounded-lg bg-card overflow-hidden">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-xs text-muted-foreground border-b border-border">
                <th className="text-left font-normal px-5 py-3">Startup</th>
                <th className="text-left font-normal px-5 py-3">Etapa</th>
                <th className="text-left font-normal px-5 py-3">Modelo</th>
                <th className="text-left font-normal px-5 py-3 cursor-pointer" onClick={() => setSortBy("score")}>
                  Readiness {sortBy === "score" && "↓"}
                </th>
                <th className="text-left font-normal px-5 py-3 cursor-pointer" onClick={() => setSortBy("mrr")}>
                  MRR {sortBy === "mrr" && "↓"}
                </th>
                <th className="text-left font-normal px-5 py-3">Runway</th>
              </tr>
            </thead>
            <tbody>
              {sorted.map((r) => (
                <tr key={r.id} className="border-b border-border/50 last:border-0 hover:bg-surface transition-all duration-150">
                  <td className="px-5 py-4">
                    <Link to={`/admin/startup/${r.id}`} className="font-medium hover:underline">{r.name}</Link>
                  </td>
                  <td className="px-5 py-4"><StageBadge stage={r.stage} /></td>
                  <td className="px-5 py-4 text-muted-foreground capitalize">{r.business_model?.replace("_", " ")}</td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-2">
                      <span className="tabular-nums">{r.readiness_score}</span>
                      <div className="h-1 w-20 bg-surface rounded-full overflow-hidden">
                        <div className="h-full bg-foreground" style={{ width: `${r.readiness_score}%` }} />
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-4 tabular-nums">{r.mrr != null ? `$${r.mrr.toLocaleString()}` : "—"}</td>
                  <td className="px-5 py-4 tabular-nums">{r.runway != null ? `${r.runway}m` : "—"}</td>
                </tr>
              ))}
              {sorted.length === 0 && (
                <tr><td colSpan={6} className="text-center py-12 text-muted-foreground">No hay startups todavía.</td></tr>
              )}
            </tbody>
          </table>
        </div>
      </div>
    </AppLayout>
  );
}

function Stat({ label, value }: { label: string; value: number }) {
  return (
    <div className="border border-border rounded-lg p-5 bg-card">
      <div className="text-xs text-muted-foreground">{label}</div>
      <div className="text-3xl font-medium tracking-tight mt-2 tabular-nums">{value}</div>
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

  const Row = ({ role, label }: { role: "user" | "investor"; label: string }) => {
    const url = `${window.location.origin}/onboarding?role=${role}`;
    return (
      <div className="flex items-center gap-3 py-2">
        <Button variant="outline" size="sm" onClick={() => copy(role)}>
          {copied === role ? (
            <><Check size={14} strokeWidth={1.5} className="mr-1.5" /> Copiado</>
          ) : (
            <><Copy size={14} strokeWidth={1.5} className="mr-1.5" /> {label}</>
          )}
        </Button>
        <code className="text-xs text-muted-foreground truncate">{url}</code>
      </div>
    );
  };

  return (
    <div className="mb-8 border border-border rounded-lg p-5 bg-card">
      <h2 className="text-sm font-medium text-foreground">Invitar</h2>
      <p className="text-xs text-muted-foreground mt-1">
        Copiá el link y compartilo por fuera (mail, WhatsApp, etc).
      </p>
      <div className="mt-3 divide-y divide-border/50">
        <Row role="user" label="Invitar usuario" />
        <Row role="investor" label="Invitar inversor" />
      </div>
    </div>
  );
}
