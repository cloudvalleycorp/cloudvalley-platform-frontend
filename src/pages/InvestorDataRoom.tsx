import { useEffect, useMemo, useState } from "react";
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
import { SegmentFilterSelect } from "@/components/investor/SegmentFilterSelect";
import { DataRoomBreadcrumbTrail } from "@/components/dataRoom/DataRoomBreadcrumbTrail";
import { FolderRow } from "@/components/dataRoom/FolderRow";
import { DocumentRow } from "@/components/dataRoom/DocumentRow";
import { usePortfolioDocuments } from "@/hooks/useSharedDocuments";
import { useDocumentViewTracking } from "@/hooks/useDocumentViewTracking";
import { useSegmentFilter } from "@/hooks/useSegmentFilter";
import { groupSharedDocuments, type DataRoomDocument, type DataRoomFolder } from "@/lib/dataRoom";
import { buildDataRoomTree, pathTo, findNode, ROOT_LEGACY_ID, type DataRoomTreeNode } from "@/lib/dataRoomTree";
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
  const [openGroupKey, setOpenGroupKey] = useState<string | null>(null);
  const [requestingFor, setRequestingFor] = useState<{ id: string; name: string } | null>(null);
  const { trackOpen } = useDocumentViewTracking();
  const openDoc = (doc: DataRoomDocument) => {
    if (!doc.file_url) return;
    trackOpen(doc.id);
    window.open(doc.file_url, "_blank");
  };

  const { segments, selectedSegmentId, setSelectedSegmentId } = useSegmentFilter(companies);
  // Regla de UX confirmada en el mockup: angostar a una empresa puntual ya
  // determina el conjunto de documentos — combinarlo con un segmento no
  // hace nada o da cero resultados en silencio si esa empresa no está en
  // el segmento, lo cual lee como bug. Se deshabilita, no se ignora.
  const segmentDisabled = companyFilter !== "all";

  const { documents, loading } = usePortfolioDocuments({
    companyIds: companyFilter === "all" ? undefined : [companyFilter],
    segmentId: segmentDisabled ? undefined : selectedSegmentId,
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

  const groups = useMemo(() => groupSharedDocuments(documents, companyFilter === "all"), [documents, companyFilter]);

  // Explorador con breadcrumbs cuando hay UNA empresa puntual elegida (Fase
  // 5b) — con "Todas las empresas" se mantiene la lista plana de arriba tal
  // cual, sin árbol cross-company (limitación de v1 aceptada explícitamente).
  const [currentFolderId, setCurrentFolderId] = useState<string | null>(null);
  useEffect(() => {
    setCurrentFolderId(null);
  }, [companyFilter]);
  const { tree: dataRoomTree, docsByFolderId } = useMemo(() => buildDataRoomTree(documents), [documents]);
  const currentFolderNode = currentFolderId && currentFolderId !== ROOT_LEGACY_ID ? findNode(dataRoomTree, currentFolderId) : null;
  const dataRoomChildFolders: DataRoomTreeNode[] =
    currentFolderId === null ? dataRoomTree : currentFolderId === ROOT_LEGACY_ID ? [] : currentFolderNode?.children ?? [];
  const dataRoomDocs = currentFolderId ? docsByFolderId.get(currentFolderId) ?? [] : [];
  const dataRoomBreadcrumbPath: DataRoomTreeNode[] =
    currentFolderId === ROOT_LEGACY_ID
      ? [{ id: ROOT_LEGACY_ID, name: "Sin categorizar", children: [] }]
      : pathTo(dataRoomTree, currentFolderId);
  const uncategorizedCount = docsByFolderId.get(ROOT_LEGACY_ID)?.length ?? 0;

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
              <SegmentFilterSelect
                segments={segments}
                value={segmentDisabled ? undefined : selectedSegmentId}
                onChange={setSelectedSegmentId}
              />
              {selectedCompany && (
                <Button variant="outline" size="sm" onClick={() => setRequestingFor(selectedCompany)}>
                  <Plus size={13} strokeWidth={1.5} className="mr-1.5" /> Solicitar documento
                </Button>
              )}
            </div>
            {segmentDisabled && segments.length > 0 && (
              <p className="text-xs text-muted-foreground -mt-3">
                El filtro de segmento se desactiva al elegir una empresa puntual.
              </p>
            )}

            {loading ? (
              <LoadingState variant="centered" className="py-16" />
            ) : companyFilter !== "all" ? (
              documents.length === 0 ? (
                <EmptyState
                  icon={FolderOpen}
                  title="Todavía no hay documentos compartidos."
                  description="Vas a ver acá lo que la startup comparta con vos."
                />
              ) : (
                <>
                  <DataRoomBreadcrumbTrail
                    rootLabel={selectedCompany?.name ?? "Data Room"}
                    path={dataRoomBreadcrumbPath}
                    onNavigate={setCurrentFolderId}
                  />
                  {dataRoomChildFolders.length === 0 && dataRoomDocs.length === 0 ? (
                    <div className="px-4 py-10 text-center text-sm text-muted-foreground border border-border rounded-lg">
                      Esta carpeta está vacía.
                    </div>
                  ) : (
                    <div className="border border-border rounded-lg overflow-hidden">
                      {dataRoomChildFolders.map((node) => {
                        const folder: DataRoomFolder = {
                          id: node.id,
                          company_id: companyFilter,
                          name: node.name,
                          parent_folder_id: null,
                          is_locked: false,
                          roadmap_pillar_ids: [],
                          order_index: 0,
                          created_at: "",
                        };
                        return (
                          <FolderRow
                            key={node.id}
                            folder={folder}
                            docCount={docsByFolderId.get(node.id)?.length ?? 0}
                            subfolderCount={node.children.length}
                            documentIds={[]}
                            canEdit={false}
                            isOwner={false}
                            companyId={null}
                            onOpen={() => setCurrentFolderId(node.id)}
                            onRename={() => {}}
                            onMove={() => {}}
                            onDelete={() => {}}
                          />
                        );
                      })}
                      {currentFolderId === null && uncategorizedCount > 0 && (
                        <button
                          type="button"
                          onClick={() => setCurrentFolderId(ROOT_LEGACY_ID)}
                          className="w-full flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 text-left hover:bg-surface/60 transition-colors"
                        >
                          <Folder size={16} strokeWidth={1.5} className="text-muted-foreground shrink-0" aria-hidden="true" />
                          <div className="flex-1 min-w-0">
                            <div className="text-sm truncate">Sin categorizar</div>
                            <div className="text-[11px] text-muted-foreground mt-0.5">
                              Documentos subidos antes de las carpetas · {uncategorizedCount} documento{uncategorizedCount === 1 ? "" : "s"}
                            </div>
                          </div>
                        </button>
                      )}
                      {dataRoomDocs.map((doc) => (
                        <DocumentRow
                          key={doc.id}
                          doc={doc}
                          tasks={[]}
                          canEdit={false}
                          isOwner={false}
                          showRoadmapBadge={false}
                          onOpen={() => openDoc(doc)}
                          onUpload={() => {}}
                          onDelete={() => {}}
                          onLinkTask={() => {}}
                          onTogglePrivacy={() => {}}
                          onSetVerified={() => {}}
                        />
                      ))}
                    </div>
                  )}
                </>
              )
            ) : groups.length === 0 ? (
              <EmptyState
                icon={FolderOpen}
                title="Todavía no hay documentos compartidos."
                description="Vas a ver acá lo que la startup comparta con vos."
              />
            ) : (
              <div className="border border-border rounded-lg divide-y divide-border">
                {groups.map((group) => {
                  const isOpen = openGroupKey === group.key;
                  return (
                    <div key={group.key}>
                      <button
                        type="button"
                        onClick={() => setOpenGroupKey(isOpen ? null : group.key)}
                        aria-expanded={isOpen}
                        className="w-full flex items-center gap-3 px-4 py-3 text-left hover:bg-surface transition-colors"
                      >
                        <Folder size={16} strokeWidth={1.5} className="text-muted-foreground shrink-0" aria-hidden="true" />
                        <span className="flex-1 min-w-0">
                          <span className="block text-sm font-medium text-foreground truncate">{group.label}</span>
                          <span className="block text-xs text-muted-foreground">
                            {group.docs.length} archivo{group.docs.length === 1 ? "" : "s"}
                          </span>
                        </span>
                        {isOpen ? (
                          <ChevronDown size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" aria-hidden="true" />
                        ) : (
                          <ChevronRight size={14} strokeWidth={1.5} className="text-muted-foreground shrink-0" aria-hidden="true" />
                        )}
                      </button>
                      {isOpen && (
                        <div className="px-4 pb-3 pl-16 space-y-1.5">
                          {group.docs.map((doc) => (
                            <button
                              key={doc.id}
                              type="button"
                              onClick={() => openDoc(doc)}
                              className="w-full flex items-center justify-between gap-3 text-left text-sm py-1.5 hover:underline"
                            >
                              <span className="min-w-0">
                                <span className="truncate block">
                                  {doc.name}
                                  {companyFilter === "all" && doc.company_name && (
                                    <span className="text-muted-foreground"> · {doc.company_name}</span>
                                  )}
                                </span>
                                {!doc.is_public && (
                                  <span className="block text-[11px] text-teal-dark no-underline">
                                    Compartido con el fondo
                                    {doc.expires_at &&
                                      ` · vence el ${new Date(doc.expires_at).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`}
                                  </span>
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
