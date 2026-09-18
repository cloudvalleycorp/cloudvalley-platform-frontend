import { Pencil, Trash2 } from "lucide-react";
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription, SheetFooter } from "@/components/ui/sheet";
import { Button } from "@/components/ui/button";
import type { RoadmapTask } from "@/lib/roadmap";

type Props = {
  task: RoadmapTask | null;
  onClose: () => void;
  // Presente SOLO cuando quien mira esto puede editar/eliminar esta tarea
  // puntual — una tarea propia del founder (requested_by_user_id === su
  // propio id, ver Roadmap.tsx). Ausente en cualquier otro caso (investor
  // viendo cualquier tarea, founder viendo una tarea de catálogo o pedida
  // por un fondo), que siguen siendo de solo lectura como siempre — antes de
  // esto NINGUNA tarea propia se podía editar ni eliminar una vez creada,
  // un callejón sin salida real si el founder se equivocaba de pilar/título
  // o quería sacarla (encontrado en vivo 2026-09-05).
  ownTaskActions?: { onEdit: () => void; onDelete: () => void };
};

// Detalle de una tarea (por qué importa / cómo hacerlo) — de solo lectura
// para todos salvo que el caller pase ownTaskActions, ver arriba. Extraído
// de Roadmap.tsx para no duplicarlo entre founder e investor.
export function RoadmapTaskDetailSheet({ task, onClose, ownTaskActions }: Props) {
  return (
    <Sheet open={!!task} onOpenChange={(o) => !o && onClose()}>
      <SheetContent>
        <SheetHeader>
          <SheetTitle>{task?.title}</SheetTitle>
          <SheetDescription>{task?.description}</SheetDescription>
        </SheetHeader>
        {task && (
          <div className="mt-6 space-y-6">
            {task.why_it_matters && (
              <div>
                <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Por qué importa</h4>
                <p className="text-sm">{task.why_it_matters}</p>
              </div>
            )}
            {task.how_to_do_it && (
              <div>
                <h4 className="text-xs uppercase tracking-wide text-muted-foreground mb-2">Cómo hacerlo</h4>
                <p className="text-sm">{task.how_to_do_it}</p>
              </div>
            )}
            {!task.description && !task.why_it_matters && !task.how_to_do_it && (
              <p className="text-sm text-muted-foreground">Esta tarea todavía no tiene más detalle cargado.</p>
            )}
          </div>
        )}
        {task && ownTaskActions && (
          <SheetFooter className="mt-6 sm:justify-start">
            <Button variant="outline" size="sm" onClick={ownTaskActions.onEdit}>
              <Pencil size={13} strokeWidth={1.5} className="mr-1.5" aria-hidden="true" /> Editar
            </Button>
            <Button variant="ghost" size="sm" className="text-destructive hover:text-destructive" onClick={ownTaskActions.onDelete}>
              <Trash2 size={13} strokeWidth={1.5} className="mr-1.5" aria-hidden="true" /> Eliminar
            </Button>
          </SheetFooter>
        )}
      </SheetContent>
    </Sheet>
  );
}
