import { Badge } from "@/components/ui/badge";

export type UserRole = "admin" | "user" | "investor";

// Solo tokens de marca: los tres roles se distinguen por familia (neutro,
// teal, rojo de marca) y el modo oscuro lo resuelven los tokens, sin variantes
// `dark:` a mano. El rojo de error no se usa acá a propósito.
const ROLE_STYLES: Record<UserRole, string> = {
  admin: "border-border bg-surface text-foreground hover:bg-surface",
  user: "border-transparent bg-teal-subtle text-teal-dark hover:bg-teal-subtle",
  investor: "border-transparent bg-primary/10 text-primary-dark hover:bg-primary/10",
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  user: "Usuario",
  investor: "Inversor",
};

export function RoleBadge({ role }: { role: UserRole }) {
  return <Badge className={ROLE_STYLES[role]}>{ROLE_LABELS[role]}</Badge>;
}
