import { useState } from "react";
import { BarChart3, Download, ExternalLink, FileText, MoreVertical, RefreshCw, ShieldCheck, Share2, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { DocumentStatusBadge } from "@/components/dataRoom/DocumentStatusBadge";
import { TaskSelector } from "@/components/dataRoom/TaskSelector";
import { ShareDialog } from "@/components/dataRoom/ShareDialog";
import { DocumentAnalyticsSheet } from "@/components/dataRoom/DocumentAnalyticsSheet";
import { useDocumentViewTracking } from "@/hooks/useDocumentViewTracking";
import type { DataRoomDocument, DataRoomTask } from "@/lib/dataRoom";

type Props = {
  doc: DataRoomDocument;
  tasks: DataRoomTask[];
  /** Subir/reemplazar/eliminar/vincular tarea — true para cualquier miembro del equipo, false para un inversor. */
  canEdit: boolean;
  /** Privacidad y verificación — true solo para el owner de la startup. */
  isOwner: boolean;
  /** Necesario para ShareDialog (fetch de conexiones/shares) — null del lado investor, donde isOwner ya es false y el botón de compartir no se muestra. */
  companyId?: string | null;
  /** Badge "Roadmap: <tarea>" — se oculta en la vista de inversor (metadata interna, no aporta ahí). */
  showRoadmapBadge?: boolean;
  /** Resaltado temporal — llegada por deep-link desde ?doc= (Dashboard > Data Readiness). */
  highlighted?: boolean;
  /** Solo documentos legacy (folder_id null, ver "Sin categorizar") — su categoría vieja, a modo de contexto. */
  legacyCategoryLabel?: string;
  onOpen: () => void;
  onUpload: (file: File) => void;
  onDelete: () => void;
  onLinkTask: (taskId: string | null) => void;
  onTogglePrivacy: (next: boolean) => void;
  onSetVerified: (next: boolean) => void;
};

export function DocumentRow({
  doc,
  tasks,
  canEdit,
  isOwner,
  companyId = null,
  showRoadmapBadge = true,
  highlighted = false,
  legacyCategoryLabel,
  onOpen,
  onUpload,
  onDelete,
  onLinkTask,
  onTogglePrivacy,
  onSetVerified,
}: Props) {
  const [sharing, setSharing] = useState(false);
  const [viewingActivity, setViewingActivity] = useState(false);
  const { trackOpen, trackDownload } = useDocumentViewTracking();

  const handleOpen = () => {
    trackOpen(doc.id);
    onOpen();
  };

  const handleDownload = () => {
    if (!doc.file_url) return;
    trackDownload(doc.id);
    const a = document.createElement("a");
    a.href = doc.file_url;
    a.download = doc.name;
    a.rel = "noopener";
    a.target = "_blank";
    a.click();
  };

  return (
    <div
      id={`doc-${doc.id}`}
      className={cn(
        "flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 transition-colors",
        highlighted && "bg-primary/5 ring-1 ring-inset ring-primary/40"
      )}
    >
      <DocumentStatusBadge status={doc.status} />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{doc.name}</div>
        {doc.status !== "missing" && (
          <div className="text-[11px] text-muted-foreground mt-0.5">
            {doc.uploaded_by_name ? `Subido por ${doc.uploaded_by_name} el ` : "Subido el "}
            {new Date(doc.created_at).toLocaleDateString("es-AR", { day: "numeric", month: "short", year: "numeric" })}
          </div>
        )}
        {showRoadmapBadge && doc.task_title && (
          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <FileText size={10} strokeWidth={1.5} />
            Roadmap: {doc.task_title}
          </div>
        )}
        {legacyCategoryLabel && (
          <div className="text-[10px] text-tertiary mt-0.5">Categoría anterior: {legacyCategoryLabel}</div>
        )}
        {/* Lado investor (canEdit=false): si lo ve pero no es is_public, es
            porque tu fondo tiene un share puntual — mostrarlo, con
            vencimiento si tiene. */}
        {!canEdit && !doc.is_public && (
          <div className="text-[10px] text-teal-dark mt-0.5">
            Compartido con vos
            {doc.expires_at && ` · vence el ${new Date(doc.expires_at).toLocaleDateString("es-AR", { day: "numeric", month: "short" })}`}
          </div>
        )}
      </div>
      {doc.file_url && (
        <button
          onClick={handleOpen}
          className="p-1.5 -m-1.5 text-muted-foreground hover:text-foreground transition-all"
          title="Abrir"
          aria-label={`Abrir ${doc.name}`}
        >
          <ExternalLink size={14} strokeWidth={1.5} />
        </button>
      )}
      {doc.file_url && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="ghost" size="icon" className="h-7 w-7" aria-label={`Más acciones para ${doc.name}`}>
              <MoreVertical size={13} strokeWidth={1.5} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            <DropdownMenuItem onClick={handleDownload}>
              <Download size={12} strokeWidth={1.5} className="mr-2" />
              Descargar
            </DropdownMenuItem>
            {isOwner && companyId && (
              <DropdownMenuItem onClick={() => setViewingActivity(true)}>
                <BarChart3 size={12} strokeWidth={1.5} className="mr-2" />
                Ver actividad
              </DropdownMenuItem>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {isOwner && companyId && (
        <DocumentAnalyticsSheet open={viewingActivity} onOpenChange={setViewingActivity} companyId={companyId} documentId={doc.id} />
      )}
      {canEdit && (
        <>
          <TaskSelector tasks={tasks} value={doc.task_id} onChange={onLinkTask} className="h-7 w-[160px] text-xs" />
          <label
            className="cursor-pointer text-muted-foreground hover:text-foreground transition-all"
            title={doc.status === "missing" ? "Subir documento" : "Reemplazar documento"}
          >
            {doc.status === "missing" ? (
              <Upload size={14} strokeWidth={1.5} />
            ) : (
              <RefreshCw size={14} strokeWidth={1.5} />
            )}
            <input type="file" className="hidden" onChange={(e) => e.target.files?.[0] && onUpload(e.target.files[0])} />
          </label>
          <button
            onClick={onDelete}
            className="p-1.5 -m-1.5 text-muted-foreground hover:text-destructive transition-all"
            title="Eliminar documento"
            aria-label={`Eliminar ${doc.name}`}
          >
            <Trash2 size={14} strokeWidth={1.5} />
          </button>
          {isOwner ? (
            <>
              <button
                onClick={() => onSetVerified(doc.status !== "verified")}
                disabled={doc.status === "missing"}
                className={cn(
                  "p-1.5 -m-1.5 transition-all disabled:opacity-30 disabled:pointer-events-none",
                  doc.status === "verified" ? "text-success" : "text-muted-foreground hover:text-foreground"
                )}
                title={doc.status === "verified" ? "Quitar verificación" : "Marcar como verificado"}
                aria-label={
                  doc.status === "verified" ? `Quitar verificación de ${doc.name}` : `Marcar ${doc.name} como verificado`
                }
              >
                <ShieldCheck size={14} strokeWidth={1.5} />
              </button>
              <button
                onClick={() => setSharing(true)}
                className="p-1.5 -m-1.5 text-muted-foreground hover:text-foreground transition-all relative"
                title={doc.is_public ? "Visible para todos los fondos conectados" : "Compartir"}
                aria-label={`Compartir ${doc.name}`}
              >
                <Share2 size={14} strokeWidth={1.5} />
                {!doc.is_public && !!doc.shared_connection_count && (
                  <span className="absolute -top-0.5 -right-0.5 w-3.5 h-3.5 rounded-full bg-primary text-primary-foreground text-[8px] font-semibold flex items-center justify-center">
                    {doc.shared_connection_count}
                  </span>
                )}
              </button>
              {companyId && (
                <ShareDialog
                  open={sharing}
                  onOpenChange={setSharing}
                  companyId={companyId}
                  resourceType="document"
                  resourceId={doc.id}
                  resourceName={doc.name}
                  isPublic={doc.is_public}
                  onTogglePublic={onTogglePrivacy}
                />
              )}
            </>
          ) : (
            <span className="text-[10px] text-tertiary" title="Solo un owner puede cambiar esto">
              {doc.is_public ? "Visible" : doc.shared_connection_count ? `Compartido (${doc.shared_connection_count})` : "Privado"}
            </span>
          )}
        </>
      )}
    </div>
  );
}
