import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { useAuth } from "@/contexts/AuthContext";
import { AppLayout } from "@/components/AppLayout";
import { NoMembershipScreen, NoMembershipBanner } from "@/components/NoMembershipScreen";
import { PageHeader } from "@/components/PageHeader";
import { EmptyState } from "@/components/EmptyState";
import { LoadingState } from "@/components/LoadingState";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { AddRoadmapTaskDialog } from "@/components/roadmap/AddRoadmapTaskDialog";
import { usePortfolioDocuments } from "@/hooks/useSharedDocuments";
import { DATA_ROOM_CATEGORIES, type DocumentCategory } from "@/lib/dataRoom";
import { LIST_ROADMAP_PILLARS_URL, type RoadmapPillar } from "@/lib/roadmap";
import { FolderOpen, Folder, ChevronDown, ChevronRight, Plus } from "lucide-react";

// Vista portfolio-wide (nueva) — el tab "Data Room" del Company Workspace
// (InvestorCompany.tsx) muestra la misma lista de carpetas para una sola
// empresa, sin el selector. "Solicitar documento" reusa upsert-roadmap-task
// con requires_doc:true (AddRoadmapTaskDialog) — no es un endpoint nuevo,
// ver decisión en el documento de diseño (sección "No incluido en esta
// lista").
export default function InvestorDataRoom() {
  const { user, loading, fund_id, portfolio_company_ids, portfolio_company_names, email } = useAuth();
  const [dismissed, setDismissed] = useState(false);
  const [reopen, setReopen] = useState(false);

  if (loading) return null;
  if (!user) return null;

  if (!fund_id) {
    if (!dismissed || reopen) {
      return (
        <AppLayout>
          <NoMembershipScreen role="investor" email={email} onDismiss={() => { setDismissed(true); setReopen(false); }} />
        </AppLayout>
      );
    }
    return (
      <AppLayout>
        <div className="max-w-6xl mx-auto px-8 py-12">
          <NoMembershipBanner role="investor" onOpen={() => setReopen(true)} />
          <EmptyState icon={FolderOpen} title="Todavía no hay nada para mostrar." description="Vas a ver los documentos de tu portfolio apenas te unas a un fondo." />
        </div>
      </AppLayout>
    );
  }

  const companies = portfolio_company_ids.map((id, i) => ({ id, name: portfolio_company_names[i] ?? "—" }));
  return <InvestorDataRoomContent companies={companies} />;
}

function InvestorDataRoomContent({ companies }: { companies: { id: string; name: string }[] }) {
  const [companyFilter, setCompanyFilter] = useState<string>("all");
  const [openCategory, setOpenCategory] = useState<DocumentCategory | null>(null);
  const [requestingFor, setRequestingFor] = useState<{ id: string; name: string } | null>(null);

  const { documents, loading } = usePortfolioDocuments({
    companyIds: companyFilter === "all" ? undefined : [companyFilter],
  });

  const { data: pillars = [] } = useQuery({
    queryKey: ["roadmap-pillars"],
    queryFn: async () => {
      const res = await fetch(LIST_ROADMAP_PILLARS_URL, { credentials: "include" });
      if (!res.ok) return [] as RoadmapPillar[];
      const data = await res.json();
      return Array.isArray(data?.pillars) ? (data.pillars as RoadmapPillar[]) : [];
    },
  });

  const byCategory = useMemo(() => {
    const map = new Map<DocumentCategory, typeof documents>();
    for (const cat of DATA_ROOM_CATEGORIES) map.set(cat.id, []);
    for (const doc of documents) {
      const list = map.get(doc.category);
      if (list) list.push(doc);
    }
    return map;
  }, [documents]);

  const selectedCompany = companyFilter === "all" ? null : companies.find((c) => c.id === companyFilter) ?? null;

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12 space-y-6">
        <PageHeader title="Data Room" subtitle={`${companies.length} empresa${companies.length === 1 ? "" : "s"} conectadas`} />

        {companies.length === 0 ? (
          <EmptyState icon={FolderOpen} title="Tu fondo todavía no tiene empresas conectadas." description="Las conexiones con startups se gestionan desde Conexiones." />
        ) : (
          <>
            <div className="flex flex-wrap items-center gap-2">
              <Select value={companyFilter} onValueChange={setCompanyFilter}>
                <SelectTrigger className="w-full sm:w-64 h-9">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todas las empresas</SelectItem>
                  {companies.map((c) => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {selectedCompany && (
                <Button variant="outline" size="sm" onClick={() => setRequestingFor(selectedCompany)}>
                  <Plus size={13} strokeWidth={1.5} className="mr-1.5" /> Solicitar documento
                </Button>
              )}
            </div>

            {loading ? (
              <LoadingState variant="centered" className="py-16" />
            ) : (
              <div className="border border-border rounded-lg divide-y divide-border">
                {DATA_ROOM_CATEGORIES.map((cat, i) => {
                  const docs = byCategory.get(cat.id) ?? [];
                  const isOpen = openCategory === cat.id;
                  return (
                    <div key={cat.id}>
                      <button
                        type="button"
                        onClick={() => setOpenCategory(isOpen ? null : cat.id)}
                        aria-expanded={isOpen}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface transition-colors"
                      >
                        <span className="inline-flex items-center justify-center w-9 h-6 rounded-full bg-secondary text-secondary-foreground text-[11px] font-mono font-medium shrink-0">
                          {i + 1}.0
                        </span>
                        <Folder size={16} strokeWidth={1.5} className="text-muted-foreground shrink-0" aria-hidden="true" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-foreground">{cat.label}</span>
                          <span className="block text-xs text-muted-foreground">
                            {docs.length === 0 ? "Sin documentos" : `${docs.length} archivo${docs.length === 1 ? "" : "s"}`}
                          </span>
                        </span>
                        {isOpen ? (
                          <ChevronDown size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronRight size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" aria-hidden="true" />
                        )}
                      </button>
                      {isOpen && docs.length > 0 && (
                        <div className="px-4 pb-3 pl-16 space-y-1.5">
                          {docs.map((doc) => (
                            <button
                              key={doc.id}
                              type="button"
                              onClick={() => doc.file_url && window.open(doc.file_url, "_blank")}
                              className="w-full flex items-center justify-between gap-3 text-left text-sm py-1.5 hover:underline"
                            >
                              <span className="min-w-0 truncate">
                                {doc.name}
                                {companyFilter === "all" && doc.company_name && (
                                  <span className="text-muted-foreground"> · {doc.company_name}</span>
                                )}
                              </span>
                              <span className="text-xs text-muted-foreground shrink-0">
                                {doc.uploaded_by_name ? `${doc.uploaded_by_name} · ` : ""}
                                {new Date(doc.created_at).toLocaleDateString("es-AR", { day: "2-digit", month: "short" })}
                              </span>
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </>
        )}
      </div>

      <AddRoadmapTaskDialog
        open={!!requestingFor}
        onOpenChange={(o) => !o && setRequestingFor(null)}
        pillars={pillars}
        defaultPillarId={pillars[0]?.id ?? ""}
        title={`Solicitar documento a ${requestingFor?.name ?? ""}`}
        description='Se crea como una tarea de roadmap con "Un documento en el Data Room" — la startup la ve y sube el archivo desde ahí.'
        onSaved={() => setRequestingFor(null)}
        companies={requestingFor ? [requestingFor] : []}
        hideTargetPicker
      />
    </AppLayout>
  );
}
