import { useEffect, useState } from "react";
import { Navigate, useParams } from "react-router-dom";
import { AppLayout } from "@/components/AppLayout";
import { BackLink } from "@/components/BackLink";
import { PageHeader } from "@/components/PageHeader";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { ReadinessScore } from "@/components/ReadinessScore";
import { StageBadge } from "@/components/StageBadge";
import { SectionCard } from "@/components/SectionCard";
import { LoadingCard } from "@/components/LoadingCard";
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
        <BackLink to="/admin" label="Volver al ecosistema" className="mb-6" />

        {startup && (
          <PageHeader
            title={startup.name}
            subtitle={
              <span className="inline-flex items-center gap-3">
                <StageBadge stage={startup.stage} />
                {startup.business_model && <span className="capitalize">{startup.business_model.replace("_", " ")}</span>}
                {startup.industry && (
                  <>
                    <span>·</span>
                    <span>{startup.industry}</span>
                  </>
                )}
              </span>
            }
          />
        )}

        <div className="grid lg:grid-cols-3 gap-6">
          <div className="lg:col-span-2 space-y-6">
            {startup ? <ReadinessScore score={score} pillars={pillars} /> : <LoadingCard lines={4} />}
          </div>

          <SectionCard title="Notas internas" description="Solo visible para admins de CloudValley">
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
          </SectionCard>
        </div>
      </div>
    </AppLayout>
  );
}
