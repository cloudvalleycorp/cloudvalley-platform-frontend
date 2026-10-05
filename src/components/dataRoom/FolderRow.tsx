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
  /** Tiene al menos un share activo (list-all-document-shares) — a diferencia de un documento, una carpeta no tiene is_public ni shared_connection_count, así que esto es lo único que indica "esta carpeta ya se comparte con alguien". */
  isShared?: boolean;
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
export function FolderRow({ folder, docCount, subfolderCount, documentIds, isShared = false, canEdit, isOwner, companyId, onOpen, onRename, onMove, onDelete }: Props) {
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
            <span title="Carpeta fija" aria-label="Carpeta fija" className="inline-flex shrink-0">
              <Lock size={11} strokeWidth={1.5} className="text-tertiary" aria-hidden="true" />
            </span>
          )}
          {isOwner && isShared && (
            <span title="Compartida con al menos un fondo" aria-label="Compartida con al menos un fondo" className="inline-flex shrink-0">
              <Share2 size={11} strokeWidth={1.5} className="text-teal-dark" aria-hidden="true" />
            </span>
          )}
        </div>
        <div className="text-xs text-muted-foreground mt-0.5">{countLabel}</div>
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
                <DropdownMenuItem onClick={onDelete} className="text-destructive-dark focus:text-destructive-dark">
                  <Trash2 size={12} strokeWidth={1.5} className="mr-2" />
                  Eliminar
                </DropdownMenuItem>
              </>
            )}
          </DropdownMenuContent>
        </DropdownMenu>
      )}
      {/* stopPropagation: Dialog/Sheet de Radix hacen portal fuera del DOM
          de esta fila, pero React sigue burbujeando el evento por el árbol
          de COMPONENTES (no el de DOM) — sin esto, tocar el Switch de
          adentro de ShareDialog también disparaba el onClick={onOpen} de la
          fila entera, navegando a la carpeta en pleno medio de compartirla.
          Mismo problema que ya resuelve DropdownMenuContent arriba. */}
      {isOwner && companyId && (
        <div onClick={(e) => e.stopPropagation()}>
          <ShareDialog
            open={sharing}
            onOpenChange={setSharing}
            companyId={companyId}
            resourceType="folder"
            resourceId={folder.id}
            resourceName={folder.name}
          />
          <FolderAnalyticsSheet
            open={viewingActivity}
            onOpenChange={setViewingActivity}
            companyId={companyId}
            folderName={folder.name}
            documentIds={documentIds}
          />
        </div>
      )}
    </div>
  );
}
