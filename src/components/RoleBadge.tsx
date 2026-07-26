import { Badge } from "@/components/ui/badge";

export type UserRole = "admin" | "user" | "investor";

const ROLE_STYLES: Record<UserRole, string> = {
  admin: "border-transparent bg-purple-100 text-purple-800 hover:bg-purple-100 dark:bg-purple-950 dark:text-purple-300 dark:hover:bg-purple-950",
  user: "border-transparent bg-blue-100 text-blue-800 hover:bg-blue-100 dark:bg-blue-950 dark:text-blue-300 dark:hover:bg-blue-950",
  investor: "border-transparent bg-amber-100 text-amber-800 hover:bg-amber-100 dark:bg-amber-950 dark:text-amber-300 dark:hover:bg-amber-950",
};

const ROLE_LABELS: Record<UserRole, string> = {
  admin: "Admin",
  user: "Usuario",
  investor: "Inversor",
};

export function RoleBadge({ role }: { role: UserRole }) {
  return <Badge className={ROLE_STYLES[role]}>{ROLE_LABELS[role]}</Badge>;
}
