import { useEffect, useMemo, useRef, useState } from "react";
import { Navigate, useSearchParams } from "react-router-dom";
import { Link2, Plus, Compass, FolderPlus, ChevronRight, Inbox, FolderOpen, Users } from "lucide-react";
import { toast } from "sonner";
import { cn } from "@/lib/utils";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { SkeletonSection } from "@/components/SkeletonSection";
import { EmptyState } from "@/components/EmptyState";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { FolderRow } from "@/components/dataRoom/FolderRow";
import { FolderNameDialog } from "@/components/dataRoom/FolderNameDialog";
import { FolderPickerDialog } from "@/components/dataRoom/FolderPickerDialog";
import { DocumentRow } from "@/components/dataRoom/DocumentRow";
import { UploadDialog } from "@/components/dataRoom/UploadDialog";
import { AccessManagementTab } from "@/components/dataRoom/AccessManagementTab";
import { useAuth } from "@/contexts/AuthContext";
import { useDocuments } from "@/hooks/useDocuments";
import { useDocumentFolders } from "@/hooks/useDocumentFolders";
import { useDataRoomTasks } from "@/hooks/useDataRoomTasks";
import { LEGACY_CATEGORY_LABELS, type DataRoomDocument } from "@/lib/dataRoom";
import InvestorDataRoom from "@/pages/InvestorDataRoom";

// Sentinel de UI para el bucket de documentos legacy (folder_id: null,
// subidos antes de que existieran las carpetas reales) — nunca se manda al
// backend, solo direcciona qué filtra este componente localmente.
const UNCATEGORIZED = "__uncategorized__" as const;
type BrowseTarget = string | typeof UNCATEGORIZED | null; // null = raíz

export default function DataRoom() {
  const { company_id, role, is_owner, loading: authLoading } = useAuth();
  const { documents, loading, uploadFile, createAndUpload, deleteDocument, togglePrivacy, setVerified, linkTask } =
    useDocuments(company_id);
  const folders = useDocumentFolders(company_id);
  const { tasks } = useDataRoomTasks(company_id);

  const [tab, setTab] = useState<"explore" | "access">("explore");
  const [current, setCurrent] = useState<BrowseTarget>(null);
  const [creatingFolder, setCreatingFolder] = useState(false);
  const [renamingFolder, setRenamingFolder] = useState<{ id: string; name: string } | null>(null);
  const [movingFolder, setMovingFolder] = useState<{ id: string; name: string } | null>(null);
  const [confirmDeleteFolder, setConfirmDeleteFolder] = useState<{ id: string; name: string } | null>(null);
  const [addingDocument, setAddingDocument] = useState(false);
  const [savingUpload, setSavingUpload] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<DataRoomDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  // Deep-link desde Data Readiness del Dashboard (?doc=<document_id>) — mismo
  // patrón single-use que ?report=/?doc= en InvestorCompany.tsx.
  const [searchParams, setSearchParams] = useSearchParams();
  const deepLinkDocId = useRef(searchParams.get("doc")).current;
  const [highlightedDocId, setHighlightedDocId] = useState<string | null>(null);
  useEffect(() => {
    if (!deepLinkDocId || documents.length === 0) return;
    const doc = documents.find((d) => d.id === deepLinkDocId);
    if (doc) {
      setCurrent(doc.folder_id ?? UNCATEGORIZED);
      setHighlightedDocId(deepLinkDocId);
    }
    const next = new URLSearchParams(searchParams);
    next.delete("doc");
    setSearchParams(next, { replace: true });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [deepLinkDocId, documents]);
  useEffect(() => {
    if (!highlightedDocId) return;
    const el = document.getElementById(`doc-${highlightedDocId}`);
    el?.scrollIntoView({ behavior: "smooth", block: "center" });
  }, [highlightedDocId, current]);

  const currentFolderId = current === null || current === UNCATEGORIZED ? null : current;
  const breadcrumb = current === null || current === UNCATEGORIZED ? [] : folders.pathTo(currentFolderId);

  const childFolders = useMemo(() => {
    if (current === null) return folders.tree;
    if (current === UNCATEGORIZED) return [];
    return folders.nodeById.get(current)?.children ?? [];
  }, [folders.tree, folders.nodeById, current]);

  const docCountByFolder = useMemo(() => {
    const map = new Map<string, number>();
    for (const d of documents) {
      if (!d.folder_id) continue;
      map.set(d.folder_id, (map.get(d.folder_id) ?? 0) + 1);
    }
    return map;
  }, [documents]);

  // Para "Ver actividad" de una carpeta (FolderAnalyticsSheet) — todos los
  // document_id de esa carpeta y sus subcarpetas.
  const documentIdsUnderFolder = (folderId: string): string[] => {
    const ids = folders.descendantIds(folderId);
    return documents.filter((d) => d.folder_id && ids.has(d.folder_id)).map((d) => d.id);
  };

  const uncategorizedDocs = useMemo(() => documents.filter((d) => !d.folder_id), [documents]);
  const visibleDocs = useMemo(() => {
    if (current === UNCATEGORIZED) return uncategorizedDocs;
    if (current === null) return [];
    return documents.filter((d) => d.folder_id === current);
  }, [documents, current, uncategorizedDocs]);

  const totalUploaded = documents.filter((d) => d.status !== "missing").length;

  if (authLoading) return null;
  // Rediseño Investor (2026-08-23): misma ruta /data-room, role-branched —
  // useDocuments/useDataRoomTasks arriba no pisan nada del lado investor
  // (company_id es null para ese rol, quedan deshabilitados solos). Cero
  // cambios al resto de este archivo, 100% experiencia del founder.
  if (role === "investor") return <InvestorDataRoom />;
  if (role !== "user") return <Navigate to="/dashboard" replace />;

  const copyLink = () => {
    navigator.clipboard.writeText(window.location.href);
    toast.success("Link copiado");
  };

  const openDoc = (doc: DataRoomDocument) => {
    if (doc.file_url) window.open(doc.file_url, "_blank");
  };

  const confirmDelete = async () => {
    if (!deletingDoc) return;
    setDeleting(true);
    const ok = await deleteDocument(deletingDoc.id);
    setDeleting(false);
    if (ok) setDeletingDoc(null);
  };

  const handleDeleteFolder = async () => {
    if (!confirmDeleteFolder) return;
    const ok = await folders.deleteFolder(confirmDeleteFolder.id);
    if (ok) setConfirmDeleteFolder(null);
  };

  const currentFolderName =
    current === UNCATEGORIZED ? "Sin categorizar" : current === null ? "Data Room" : folders.byId.get(current)?.name ?? "Data Room";

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <PageHeader
          size="compact"
          title="Data Room"
          subtitle={`${totalUploaded} de ${documents.length} documentos cargados`}
          action={
            <div className="flex items-center gap-2">
              {is_owner && (
                <div className="inline-flex border border-border rounded-md overflow-hidden h-9">
                  <button
                    onClick={() => setTab("explore")}
                    className={cn(
                      "px-3 text-xs flex items-center gap-1.5 transition-all",
                      tab === "explore" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <FolderOpen size={12} strokeWidth={1.5} /> Explorar
                  </button>
                  <button
                    onClick={() => setTab("access")}
                    className={cn(
                      "px-3 text-xs flex items-center gap-1.5 transition-all border-l border-border",
                      tab === "access" ? "bg-foreground text-background" : "text-muted-foreground hover:text-foreground"
                    )}
                  >
                    <Users size={12} strokeWidth={1.5} /> Accesos
                  </button>
                </div>
              )}
              {tab === "explore" && (
                <Button variant="outline" onClick={copyLink}>
                  <Link2 size={14} strokeWidth={1.5} className="mr-2" /> Compartir link
                </Button>
              )}
            </div>
          }
        />

        {tab === "access" ? (
          <AccessManagementTab companyId={company_id} documentIdsUnderFolder={documentIdsUnderFolder} />
        ) : (
        <>
        {/* Breadcrumbs */}
        <div className="flex items-center gap-1.5 text-sm mb-6 flex-wrap">
          <button
            onClick={() => setCurrent(null)}
            className={current === null ? "font-medium text-foreground" : "text-muted-foreground hover:text-foreground"}
          >
            Data Room
          </button>
          {current === UNCATEGORIZED && (
            <>
              <ChevronRight size={13} strokeWidth={1.5} className="text-tertiary" />
              <span className="font-medium text-foreground">Sin categorizar</span>
            </>
          )}
          {breadcrumb.map((f, i) => (
            <span key={f.id} className="flex items-center gap-1.5">
              <ChevronRight size={13} strokeWidth={1.5} className="text-tertiary" />
              <button
                onClick={() => setCurrent(f.id)}
                className={
                  i === breadcrumb.length - 1
                    ? "font-medium text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }
              >
                {f.name}
              </button>
            </span>
          ))}
        </div>

        {deepLinkDocId && highlightedDocId === deepLinkDocId && (
          <div className="flex items-center gap-2 rounded-lg border border-teal/30 bg-teal-subtle text-teal-dark text-sm px-4 py-2.5 mb-6">
            <Compass size={14} strokeWidth={1.5} aria-hidden="true" />
            Llegaste desde el Dashboard: este documento necesita atención.
          </div>
        )}

        {(loading || folders.loading) ? (
          <SkeletonSection rows={6} columns={3} />
        ) : (
          <>
            <div className="flex items-center gap-2 mb-4">
              <Button variant="outline" size="sm" onClick={() => setCreatingFolder(true)}>
                <FolderPlus size={13} strokeWidth={1.5} className="mr-1.5" /> Nueva carpeta
              </Button>
              {current !== null && current !== UNCATEGORIZED && (
                <Button size="sm" onClick={() => setAddingDocument(true)}>
                  <Plus size={13} strokeWidth={1.5} className="mr-1.5" /> Agregar documento
                </Button>
              )}
            </div>

            {folders.folders.length === 0 && uncategorizedDocs.length === 0 ? (
              <EmptyState
                icon={FolderPlus}
                title="Todavía no creaste ninguna carpeta."
                description="Creá tu primera carpeta para empezar a organizar y subir documentos — el Data Room ya no usa categorías fijas, vos decidís cómo lo ordenás."
                action={{ label: "Crear carpeta", onClick: () => setCreatingFolder(true) }}
              />
            ) : (
              <div className="border border-border rounded-lg bg-card overflow-hidden">
                {childFolders.length === 0 && visibleDocs.length === 0 && current !== null ? (
                  <div className="px-4 py-10 text-center text-sm text-muted-foreground">
                    Esta carpeta está vacía.
                  </div>
                ) : (
                  <>
                    {childFolders.map((f) => (
                      <FolderRow
                        key={f.id}
                        folder={f}
                        docCount={docCountByFolder.get(f.id) ?? 0}
                        subfolderCount={f.children.length}
                        documentIds={documentIdsUnderFolder(f.id)}
                        canEdit
                        isOwner={is_owner}
                        companyId={company_id}
                        onOpen={() => setCurrent(f.id)}
                        onRename={() => setRenamingFolder({ id: f.id, name: f.name })}
                        onMove={() => setMovingFolder({ id: f.id, name: f.name })}
                        onDelete={() => setConfirmDeleteFolder({ id: f.id, name: f.name })}
                      />
                    ))}
                    {current === null && uncategorizedDocs.length > 0 && (
                      <div
                        role="button"
                        tabIndex={0}
                        onClick={() => setCurrent(UNCATEGORIZED)}
                        onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && setCurrent(UNCATEGORIZED)}
                        className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 cursor-pointer hover:bg-surface/60 transition-colors"
                      >
                        <Inbox size={16} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
                        <div className="flex-1 min-w-0">
                          <div className="text-sm truncate">Sin categorizar</div>
                          <div className="text-[11px] text-muted-foreground mt-0.5">
                            Documentos subidos antes de las carpetas · {uncategorizedDocs.length} documento
                            {uncategorizedDocs.length === 1 ? "" : "s"}
                          </div>
                        </div>
                      </div>
                    )}
                    {visibleDocs.map((doc) => (
                      <DocumentRow
                        key={doc.id}
                        doc={doc}
                        tasks={tasks}
                        canEdit
                        isOwner={is_owner}
                        companyId={company_id}
                        highlighted={doc.id === highlightedDocId}
                        onOpen={() => openDoc(doc)}
                        onUpload={(file) => uploadFile(doc.id, file)}
                        onDelete={() => setDeletingDoc(doc)}
                        onLinkTask={(taskId) => linkTask(doc.id, taskId)}
                        onTogglePrivacy={(next) => togglePrivacy(doc.id, next)}
                        onSetVerified={(next) => setVerified(doc.id, next)}
                        legacyCategoryLabel={doc.category ? LEGACY_CATEGORY_LABELS[doc.category] : undefined}
                      />
                    ))}
                  </>
                )}
              </div>
            )}
          </>
        )}
        </>
        )}
      </div>

      <FolderNameDialog
        open={creatingFolder}
        onOpenChange={setCreatingFolder}
        mode="create"
        onSubmit={async (name) => {
          const id = await folders.createFolder(name, currentFolderId);
          if (id) setCreatingFolder(false);
        }}
      />

      <FolderNameDialog
        open={!!renamingFolder}
        onOpenChange={(o) => !o && setRenamingFolder(null)}
        mode="rename"
        initialName={renamingFolder?.name}
        onSubmit={async (name) => {
          if (!renamingFolder) return;
          const ok = await folders.renameFolder(renamingFolder.id, name);
          if (ok) setRenamingFolder(null);
        }}
      />

      {movingFolder && (
        <FolderPickerDialog
          open={!!movingFolder}
          onOpenChange={(o) => !o && setMovingFolder(null)}
          title={`Mover "${movingFolder.name}"`}
          description="Elegí la carpeta destino, o la raíz."
          tree={folders.tree}
          excludeIds={folders.descendantIds(movingFolder.id)}
          allowRoot
          confirmLabel="Mover acá"
          onCreateFolder={folders.createFolder}
          onConfirm={async (targetId) => {
            const ok = await folders.moveFolder(movingFolder.id, targetId);
            if (ok) setMovingFolder(null);
          }}
        />
      )}

      <UploadDialog
        open={addingDocument}
        onOpenChange={setAddingDocument}
        folderLabel={currentFolderName}
        tasks={tasks}
        busy={savingUpload}
        onSubmit={async ({ name, file, taskId, isPublic }) => {
          if (currentFolderId === null) return;
          setSavingUpload(true);
          const ok = await createAndUpload(currentFolderId, name, file, taskId, isPublic);
          setSavingUpload(false);
          if (ok) setAddingDocument(false);
        }}
      />

      <ConfirmationDialog
        open={!!deletingDoc}
        onOpenChange={(open) => !open && setDeletingDoc(null)}
        title="Eliminar documento"
        description={
          <>
            Se eliminará <strong>{deletingDoc?.name}</strong> del Data Room. Esta acción no se puede deshacer.
          </>
        }
        confirmLabel="Eliminar documento"
        variant="destructive"
        busy={deleting}
        onConfirm={confirmDelete}
      />

      <ConfirmationDialog
        open={!!confirmDeleteFolder}
        onOpenChange={(open) => !open && setConfirmDeleteFolder(null)}
        title="Eliminar carpeta"
        description={
          <>
            Se eliminará la carpeta <strong>{confirmDeleteFolder?.name}</strong>. Solo se puede eliminar si está
            vacía — movés o borrás su contenido primero.
          </>
        }
        confirmLabel="Eliminar carpeta"
        variant="destructive"
        onConfirm={handleDeleteFolder}
      />
    </AppLayout>
  );
}
