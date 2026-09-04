import type { ReactNode } from "react";
import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

type Props = {
  value: string;
  title: string;
  countLabel: string;
  children: ReactNode;
  /** "1.0", "2.0"... — orden de la categoría dentro del Data Room, ver DATA_ROOM_CATEGORIES. Opcional: sin esto no se muestra el número. */
  num?: string;
};

/** Una categoría del Data Room como card colapsable — usar dentro de un <Accordion type="multiple">. */
export function CategoryAccordion({ value, title, countLabel, children, num }: Props) {
  return (
    <AccordionItem value={value} className="border border-border rounded-lg bg-card mb-3 last:mb-0 overflow-hidden">
      <AccordionTrigger className="px-4 py-[13px] bg-surface/60 hover:no-underline">
        <div className="flex items-center gap-3 text-left">
          {num && <span className="text-[11px] font-medium text-tertiary w-6 shrink-0 tabular-nums">{num}</span>}
          <div>
            <h2 className="text-[13px] font-medium">{title}</h2>
            <p className="text-[11.5px] text-muted-foreground mt-0.5">{countLabel}</p>
          </div>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pt-0 pb-0">
        <div className="border-t border-border">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}
