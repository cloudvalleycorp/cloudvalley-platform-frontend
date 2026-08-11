import { Link } from "react-router-dom";

export function BrandMark() {
  return (
    <Link
      to="/"
      className="fixed top-6 left-6 sm:top-8 sm:left-8 z-10 inline-flex items-center gap-2 text-sm font-medium tracking-tight text-foreground hover:text-foreground/70 transition-colors"
    >
      <img src="/logo.svg" alt="" className="h-6 w-6 shrink-0" />
      CloudValley
    </Link>
  );
}
