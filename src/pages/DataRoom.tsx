import { useState } from "react";
import { Navigate } from "react-router-dom";
import { Link2, Plus } from "lucide-react";
import { toast } from "sonner";
import { AppLayout } from "@/components/AppLayout";
import { PageHeader } from "@/components/PageHeader";
import { Button } from "@/components/ui/button";
import { Accordion } from "@/components/ui/accordion";
import { SkeletonSection } from "@/components/SkeletonSection";
import { ConfirmationDialog } from "@/components/ConfirmationDialog";
import { CategoryAccordion } from "@/components/dataRoom/CategoryAccordion";
import { DocumentRow } from "@/components/dataRoom/DocumentRow";
import { UploadDialog } from "@/components/dataRoom/UploadDialog";
import { useAuth } from "@/contexts/AuthContext";
import { useDocuments } from "@/hooks/useDocuments";
import { useDataRoomTasks } from "@/hooks/useDataRoomTasks";
import {
  DATA_ROOM_CATEGORIES,
  CATEGORY_TO_ROADMAP_PILLARS,
  type DataRoomDocument,
  type DocumentCategory,
} from "@/lib/dataRoom";
import InvestorDataRoom from "@/pages/InvestorDataRoom";

export default function DataRoom() {
  const { company_id, role, is_owner, loading: authLoading } = useAuth();
  const { documents, loading, uploadFile, createAndUpload, deleteDocument, togglePrivacy, setVerified, linkTask } =
    useDocuments(company_id);
  const { tasks } = useDataRoomTasks(company_id);

  const [addingCategory, setAddingCategory] = useState<DocumentCategory | null>(null);
  const [savingUpload, setSavingUpload] = useState(false);
  const [deletingDoc, setDeletingDoc] = useState<DataRoomDocument | null>(null);
  const [deleting, setDeleting] = useState(false);

  if (authLoading) return null;
  // Rediseño Investor (2026-08-23): misma ruta /data-room, role-branched —
  // useDocuments/useDataRoomTasks arriba no pisan nada del lado investor
  // (company_id es null para ese rol, quedan deshabilitados solos). Cero
  // cambios al resto de este archivo, 100% experiencia del founder.
  if (role === "investor") return <InvestorDataRoom />;
  if (role !== "user") return <Navigate to="/dashboard" replace />;

  const totalUploaded = documents.filter((d) => d.status !== "missing").length;

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

  return (
    <AppLayout>
      <div className="max-w-6xl mx-auto px-8 py-12">
        <PageHeader
          title="Data Room"
          subtitle={`${totalUploaded} de ${documents.length} documentos cargados`}
          action={
            <Button variant="outline" onClick={copyLink}>
              <Link2 size={14} strokeWidth={1.5} className="mr-2" /> Compartir link
            </Button>
          }
        />

        {loading ? (
          <SkeletonSection rows={6} columns={3} />
        ) : (
          <Accordion type="multiple" defaultValue={DATA_ROOM_CATEGORIES.map((c) => c.id)}>
            {DATA_ROOM_CATEGORIES.map((cat) => {
              const items = documents.filter((d) => d.category === cat.id);
              const uploaded = items.filter((d) => d.status !== "missing").length;
              return (
                <CategoryAccordion
                  key={cat.id}
                  value={cat.id}
                  title={cat.label}
                  countLabel={`${uploaded}/${items.length} cargados`}
                >
                  {items.map((doc) => (
                    <DocumentRow
                      key={doc.id}
                      doc={doc}
                      tasks={tasks}
                      canEdit
                      isOwner={is_owner}
                      onOpen={() => openDoc(doc)}
                      onUpload={(file) => uploadFile(doc.id, file)}
                      onDelete={() => setDeletingDoc(doc)}
                      onLinkTask={(taskId) => linkTask(doc.id, taskId)}
                      onTogglePrivacy={(next) => togglePrivacy(doc.id, next)}
                      onSetVerified={(next) => setVerified(doc.id, next)}
                    />
                  ))}
                  <button
                    onClick={() => setAddingCategory(cat.id)}
                    className="w-full flex items-center gap-2 px-6 py-3 text-sm text-muted-foreground hover:text-foreground transition-all border-t border-border/50"
                  >
                    <Plus size={14} strokeWidth={1.5} /> Agregar documento
                  </button>
                </CategoryAccordion>
              );
            })}
          </Accordion>
        )}
      </div>

      <UploadDialog
        open={!!addingCategory}
        onOpenChange={(open) => !open && setAddingCategory(null)}
        categoryLabel={DATA_ROOM_CATEGORIES.find((c) => c.id === addingCategory)?.label ?? ""}
        tasks={
          addingCategory
            ? tasks.filter((t) => (CATEGORY_TO_ROADMAP_PILLARS[addingCategory] ?? []).includes(t.pillar_name))
            : []
        }
        busy={savingUpload}
        onSubmit={async ({ name, file, taskId, isPublic }) => {
          if (!addingCategory) return;
          setSavingUpload(true);
          const ok = await createAndUpload(addingCategory, name, file, taskId, isPublic);
          setSavingUpload(false);
          if (ok) setAddingCategory(null);
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
    </AppLayout>
  );
}
