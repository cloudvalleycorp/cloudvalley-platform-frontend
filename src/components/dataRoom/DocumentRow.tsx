import { ExternalLink, FileText, RefreshCw, ShieldCheck, Trash2, Upload } from "lucide-react";
import { cn } from "@/lib/utils";
import { PrivacyToggle } from "@/components/privacy/PrivacyToggle";
import { DocumentStatusBadge } from "@/components/dataRoom/DocumentStatusBadge";
import { TaskSelector } from "@/components/dataRoom/TaskSelector";
import type { DataRoomDocument, DataRoomTask } from "@/lib/dataRoom";

type Props = {
  doc: DataRoomDocument;
  tasks: DataRoomTask[];
  /** Subir/reemplazar/eliminar/vincular tarea — true para cualquier miembro del equipo, false para un inversor. */
  canEdit: boolean;
  /** Privacidad y verificación — true solo para el owner de la startup. */
  isOwner: boolean;
  /** Badge "Roadmap: <tarea>" — se oculta en la vista de inversor (metadata interna, no aporta ahí). */
  showRoadmapBadge?: boolean;
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
  showRoadmapBadge = true,
  onOpen,
  onUpload,
  onDelete,
  onLinkTask,
  onTogglePrivacy,
  onSetVerified,
}: Props) {
  return (
    <div className="flex items-center gap-3 px-6 py-3 border-b border-border/50 last:border-0">
      <DocumentStatusBadge status={doc.status} />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate">{doc.name}</div>
        {showRoadmapBadge && doc.task_title && (
          <div className="text-[10px] text-muted-foreground mt-0.5 flex items-center gap-1">
            <FileText size={10} strokeWidth={1.5} />
            Roadmap: {doc.task_title}
          </div>
        )}
      </div>
      {doc.file_url && (
        <button
          onClick={onOpen}
          className="p-1.5 -m-1.5 text-muted-foreground hover:text-foreground transition-all"
          title="Abrir"
          aria-label={`Abrir ${doc.name}`}
        >
          <ExternalLink size={14} strokeWidth={1.5} />
        </button>
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
              <PrivacyToggle
                isPublic={doc.is_public}
                onChange={onTogglePrivacy}
                publicLabel="Visible para inversores conectados"
                privateLabel="Privado · solo vos"
              />
            </>
          ) : (
            <span className="text-[10px] text-tertiary" title="Solo un owner puede cambiar esto">
              {doc.is_public ? "Visible" : "Privado"}
            </span>
          )}
        </>
      )}
    </div>
  );
}
