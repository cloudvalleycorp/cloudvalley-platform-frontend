import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from "@/components/ui/sheet";
import type { RoadmapTask } from "@/lib/roadmap";

type Props = {
  task: RoadmapTask | null;
  onClose: () => void;
};

// Detalle de una tarea (por qué importa / cómo hacerlo) — siempre de solo
// lectura, igual en founder e investor, extraído de Roadmap.tsx para no
// duplicarlo.
export function RoadmapTaskDetailSheet({ task, onClose }: Props) {
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
      </SheetContent>
    </Sheet>
  );
}
