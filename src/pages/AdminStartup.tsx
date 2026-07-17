import { useEffect, useState } from "react";
import { Navigate, useParams, Link } from "react-router-dom";
import { ArrowLeft } from "lucide-react";
import { AppLayout } from "@/components/AppLayout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ReadinessScore } from "@/components/ReadinessScore";
import { StageBadge } from "@/components/StageBadge";
import { calculateReadinessScore, PillarBreakdown } from "@/lib/score";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "sonner";

export default function AdminStartup() {
  const { id } = useParams();
  const { isAdmin, loading, user } = useAuth();
  const [startup, setStartup] = useState<any>(null);
  const [score, setScore] = useState(0);
  const [pillars, setPillars] = useState<PillarBreakdown[]>([]);
  const [notes, setNotes] = useState<any[]>([]);
  const [newNote, setNewNote] = useState("");

  useEffect(() => {
    if (!id || !isAdmin) return;
    (async () => {
      // TODO: migrar a backend propio
      const { data: s } = await supabase.from("startups").select("*").eq("id", id).maybeSingle();
      setStartup(s);
      const { total, pillars } = await calculateReadinessScore(id);
      setScore(total); setPillars(pillars);
      // TODO: migrar a backend propio
      const { data: ns } = await supabase.from("admin_notes").select("*").eq("startup_id", id)
        .order("created_at", { ascending: false });
      setNotes(ns ?? []);
    })();
  }, [id, isAdmin]);

  const addNote = async () => {
    if (!id || !newNote || !user) return;
    // TODO: migrar a backend propio
    await supabase.from("admin_notes").insert({ startup_id: id, content: newNote, author_id: user.id });
    setNewNote(""); toast.success("Nota agregada");
    // TODO: migrar a backend propio
    const { data } = await supabase.from("admin_notes").select("*").eq("startup_id", id)
      .order("created_at", { ascending: false });
    setNotes(data ?? []);
  };

  if (loading) return null;
  if (!isAdmin) return <Navigate to="/dashboard" replace />;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <Link to="/admin" className="inline-flex items-center gap-1.5 text-sm text-muted-foreground hover:text-foreground mb-6">
          <ArrowLeft size={14} strokeWidth={1.5} /> Volver al ecosistema
        </Link>

        {startup && (
          <header className="mb-8">
            <h1 className="text-3xl font-medium tracking-tight">{startup.name}</h1>
            <div className="flex items-center gap-3 mt-2">
              <StageBadge stage={startup.stage} />
              <span className="text-sm text-muted-foreground capitalize">{startup.business_model?.replace("_", " ")}</span>
              <span className="text-sm text-muted-foreground">·</span>
              <span className="text-sm text-muted-foreground">{startup.industry}</span>
            </div>
          </header>
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            <ReadinessScore score={score} pillars={pillars} />
          </div>

          <aside className="border border-border rounded-lg bg-card p-5">
            <h2 className="text-sm font-medium mb-3">Notas internas</h2>
            <p className="text-xs text-muted-foreground mb-4">Solo visible para admins de CloudValley</p>
            <Textarea
              value={newNote}
              onChange={(e) => setNewNote(e.target.value)}
              placeholder="Agregar una nota…"
              className="text-sm"
              rows={3}
            />
            <Button size="sm" onClick={addNote} disabled={!newNote} className="mt-2 w-full">Agregar nota</Button>

            <div className="mt-6 space-y-3">
              {notes.map((n) => (
                <div key={n.id} className="text-sm border-t border-border pt-3">
                  <p>{n.content}</p>
                  <p className="text-xs text-tertiary mt-1">{new Date(n.created_at).toLocaleDateString()}</p>
                </div>
              ))}
            </div>
          </aside>
        </div>
      </div>
    </AppLayout>
  );
}
