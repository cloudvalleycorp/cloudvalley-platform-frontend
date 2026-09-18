import { useState } from "react";
import { ChevronRight, ChevronDown, Folder, FolderPlus, FolderClosed } from "lucide-react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { EmptyState } from "@/components/EmptyState";
import { cn } from "@/lib/utils";
import { FolderNameDialog } from "@/components/dataRoom/FolderNameDialog";
import type { FolderNode } from "@/hooks/useDocumentFolders";

function PickerRow({
  node,
  depth,
  selectedId,
  excludeIds,
  onSelect,
  onCreateChild,
}: {
  node: FolderNode;
  depth: number;
  selectedId: string | null;
  excludeIds?: Set<string>;
  onSelect: (id: string) => void;
  onCreateChild: (parentId: string) => void;
}) {
  const [open, setOpen] = useState(true);
  const disabled = excludeIds?.has(node.id) ?? false;
  return (
    <div>
      <div
        className={cn(
          "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm",
          disabled ? "opacity-40 cursor-not-allowed" : "cursor-pointer hover:bg-surface",
          selectedId === node.id && !disabled && "bg-primary/10 text-primary"
        )}
        style={{ paddingLeft: 8 + depth * 18 }}
        onClick={() => !disabled && onSelect(node.id)}
      >
        {node.children.length > 0 ? (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              setOpen((o) => !o);
            }}
            className="text-muted-foreground shrink-0"
          >
            {open ? <ChevronDown size={13} strokeWidth={1.5} /> : <ChevronRight size={13} strokeWidth={1.5} />}
          </button>
        ) : (
          <span className="w-[13px] shrink-0" />
        )}
        <Folder size={14} strokeWidth={1.5} className="shrink-0 text-muted-foreground" />
        <span className="flex-1 truncate">{node.name}</span>
        {!disabled && (
          <button
            type="button"
            onClick={(e) => {
              e.stopPropagation();
              onCreateChild(node.id);
            }}
            className="p-1 -m-1 text-muted-foreground hover:text-foreground shrink-0"
            title="Crear subcarpeta acá"
            aria-label={`Crear subcarpeta dentro de ${node.name}`}
          >
            <FolderPlus size={13} strokeWidth={1.5} />
          </button>
        )}
      </div>
      {open &&
        node.children.map((child) => (
          <PickerRow
            key={child.id}
            node={child}
            depth={depth + 1}
            selectedId={selectedId}
            excludeIds={excludeIds}
            onSelect={onSelect}
            onCreateChild={onCreateChild}
          />
        ))}
    </div>
  );
}

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  description?: string;
  tree: FolderNode[];
  /** Ids que no se pueden elegir (la carpeta que se está moviendo + sus descendientes). */
  excludeIds?: Set<string>;
  /** true en "mover carpeta" (la raíz es un destino válido); false al elegir dónde subir un documento nuevo. */
  allowRoot?: boolean;
  confirmLabel?: string;
  onCreateFolder: (name: string, parentFolderId: string | null) => Promise<string | null>;
  onConfirm: (folderId: string | null) => void;
};

/** Árbol de carpetas para elegir un destino — subir un documento nuevo o mover una carpeta. Permite crear una carpeta sin salir del diálogo. */
export function FolderPickerDialog({
  open,
  onOpenChange,
  title,
  description,
  tree,
  excludeIds,
  allowRoot = false,
  confirmLabel = "Elegir",
  onCreateFolder,
  onConfirm,
}: Props) {
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [creatingUnder, setCreatingUnder] = useState<string | null | undefined>(undefined);
  const [creating, setCreating] = useState(false);

  const handleCreate = async (name: string) => {
    setCreating(true);
    const folderId = await onCreateFolder(name, creatingUnder ?? null);
    setCreating(false);
    if (folderId) {
      setSelectedId(folderId);
      setCreatingUnder(undefined);
    }
  };

  return (
    <>
      <Dialog
        open={open}
        onOpenChange={(o) => {
          if (!o) setSelectedId(null);
          onOpenChange(o);
        }}
      >
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{title}</DialogTitle>
            {description && <DialogDescription>{description}</DialogDescription>}
          </DialogHeader>

          <div className="max-h-[50vh] overflow-y-auto -mx-1 px-1">
            {allowRoot && (
              <div
                className={cn(
                  "flex items-center gap-1.5 rounded-md px-2 py-1.5 text-sm cursor-pointer hover:bg-surface",
                  selectedId === null && "bg-primary/10 text-primary"
                )}
                onClick={() => setSelectedId(null)}
              >
                <span className="w-[13px] shrink-0" />
                <FolderClosed size={14} strokeWidth={1.5} className="shrink-0 text-muted-foreground" />
                <span className="flex-1">Raíz de Data Room</span>
              </div>
            )}
            {tree.length === 0 ? (
              <EmptyState
                bordered={false}
                icon={Folder}
                title="Todavía no creaste ninguna carpeta."
                description="Creá la primera carpeta para poder elegirla acá."
              />
            ) : (
              tree.map((node) => (
                <PickerRow
                  key={node.id}
                  node={node}
                  depth={0}
                  selectedId={selectedId}
                  excludeIds={excludeIds}
                  onSelect={setSelectedId}
                  onCreateChild={(parentId) => setCreatingUnder(parentId)}
                />
              ))
            )}
          </div>

          <Button variant="outline" size="sm" className="w-fit" onClick={() => setCreatingUnder(null)}>
            <FolderPlus size={13} strokeWidth={1.5} className="mr-1.5" /> Nueva carpeta en la raíz
          </Button>

          <DialogFooter>
            <Button variant="ghost" onClick={() => onOpenChange(false)}>
              Cancelar
            </Button>
            <Button disabled={selectedId === null && !allowRoot} onClick={() => onConfirm(selectedId)}>
              {confirmLabel}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <FolderNameDialog
        open={creatingUnder !== undefined}
        onOpenChange={(o) => !o && setCreatingUnder(undefined)}
        mode="create"
        busy={creating}
        onSubmit={handleCreate}
      />
    </>
  );
}
