import { createContext, useContext, type ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { Button } from "@/components/ui/button";
import type { AssistantContext } from "./assistantModel";

const Context = createContext<((context?: Partial<AssistantContext>) => void) | null>(null);
export const DemoAssistantContextProvider = Context.Provider;
export function AssistantEntry({ context, children = "Consultar al asistente" }: { context?: Partial<AssistantContext>; children?: ReactNode }) {
  const open = useContext(Context);
  if (!open) return null;
  return <Button type="button" variant="ghost" onClick={() => open(context)}><Sparkles size={15} />{children}</Button>;
}
