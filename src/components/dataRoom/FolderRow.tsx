import { useState } from "react";
import { BarChart3, Folder, MoreVertical, Pencil, FolderInput, Share2, Trash2, Lock } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { ShareDialog } from "@/components/dataRoom/ShareDialog";
import { FolderAnalyticsSheet } from "@/components/dataRoom/FolderAnalyticsSheet";
import type { DataRoomFolder } from "@/lib/dataRoom";

type Props = {
  folder: DataRoomFolder;
  docCount: number;
  subfolderCount: number;
  /** Todos los document_id de esta carpeta y sus subcarpetas — para "Ver actividad" (useFolderAnalytics). */
  documentIds: string[];
  canEdit: boolean;
  /** Compartir — igual que documentos, solo el owner de la startup. */
  isOwner: boolean;
  companyId: string | null;
  onOpen: () => void;
  onRename: () => void;
  onMove: () => void;
  onDelete: () => void;
};

/** Una subcarpeta dentro del directorio actual de Data Room — nombre, cantidad de contenido, acciones. */
export function FolderRow({ folder, docCount, subfolderCount, documentIds, canEdit, isOwner, companyId, onOpen, onRename, onMove, onDelete }: Props) {
  const [sharing, setSharing] = useState(false);
  const [viewingActivity, setViewingActivity] = useState(false);
  const countLabel = [
    subfolderCount > 0 ? `${subfolderCount} carpeta${subfolderCount === 1 ? "" : "s"}` : null,
    `${docCount} documento${docCount === 1 ? "" : "s"}`,
  ]
    .filter(Boolean)
    .join(" · ");

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onOpen}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && onOpen()}
      className="flex items-center gap-3 px-4 py-2.5 border-b border-border/50 last:border-0 cursor-pointer hover:bg-surface/60 transition-colors"
    >
      <Folder size={16} strokeWidth={1.5} className="text-muted-foreground shrink-0" />
      <div className="flex-1 min-w-0">
        <div className="text-sm truncate flex items-center gap-1.5">
          {folder.name}
          {folder.is_locked && (
            <Lock size={11} strokeWidth={1.5} className="text-tertiary shrink-0" aria-label="Carpeta fija" />
          )}
        </div>
        <div className="text-[11px] text-muted-foreground mt-0.5">{countLabel}</div>
      </div>
      {canEdit && (
        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button
              variant="ghost"
              size="icon"
              className="h-7 w-7 shrink-0"
              onClick={(e) => e.stopPropagation()}
              aria-label={`Más acciones para ${folder.name}`}
            >
              <MoreVertical size={14} strokeWidth={1.5} />
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end" onClick={(e) => e.stopPropagation()}>
            {isOwner && (
              <DropdownMenuItem onClick={() => setSharing(true)}>
                <Share2 size={12} strokeWidth={1.5} className="mr-2" />
                Compartir
              </DropdownMenuItem>
            )}
            {isOwner && (
              <DropdownMenuItem onClick={() => setViewingActivity(true)}>
                <BarChart3 size={12} strokeWidth={1.5} className="mr-2" />
                Ver actividad
              </DropdownMenuItem>
            )}
            <DropdownMenuItem onClick={onRename}>
              <Pencil size={12} strokeWidth={1.5} className="mr-2" />
              Renombrar
            </DropdownMenuItem>
            {!folder.is_locked && (
              <DropdownMenuItem onClick={onMove}>
                <FolderInput size={12} strokeWidth={1.5} className="mr-2" />
                Mover
              </DropdownMenuItem>
            )}
            {!folder.is_locked && (
              <>
                <DropdownMenuSeparator />
                <DropdownMenuItem onClick={onDelete} className="text-destructive focus:text-destructive">
                  <Trash2 size={12} strokeWidth={1.5} className="mr-2" />
                  Eliminar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {isOwner && companyId && (
        <ShareDialog
          open={sharing}
          onOpenChange={setSharing}
          companyId={companyId}
          resourceType="folder"
          resourceId={folder.id}
          resourceName={folder.name}
        />
      )}
      {isOwner && companyId && (
        <FolderAnalyticsSheet
          open={viewingActivity}
          onOpenChange={setViewingActivity}
          companyId={companyId}
          folderName={folder.name}
          documentIds={documentIds}
        />
      )}
    </div>
  );
}
