import { Link } from "react-router-dom";

export function BrandMark() {
  return (
    <Link
      to="/"
      className="fixed top-6 left-6 sm:top-8 sm:left-8 text-sm font-medium tracking-tight text-foreground hover:text-foreground/70 transition-colors z-10"
    >
      CloudValley
    </Link>
  );
}
