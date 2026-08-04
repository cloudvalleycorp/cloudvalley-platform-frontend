import type { ReactNode } from "react";
import { AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";

type Props = {
  value: string;
  title: string;
  countLabel: string;
  children: ReactNode;
};

/** Una categoría del Data Room como card colapsable — usar dentro de un <Accordion type="multiple">. */
export function CategoryAccordion({ value, title, countLabel, children }: Props) {
  return (
    <AccordionItem value={value} className="border border-border rounded-lg bg-card mb-3 last:mb-0">
      <AccordionTrigger className="px-6 py-4 hover:no-underline">
        <div className="text-left">
          <h2 className="text-base font-medium">{title}</h2>
          <p className="text-xs text-muted-foreground mt-0.5">{countLabel}</p>
        </div>
      </AccordionTrigger>
      <AccordionContent className="pt-0 pb-0">
        <div className="border-t border-border">{children}</div>
      </AccordionContent>
    </AccordionItem>
  );
}
