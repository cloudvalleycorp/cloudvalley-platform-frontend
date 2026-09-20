import { createRoot } from "react-dom/client";
import { ThemeProvider } from "next-themes";
import "./index.css";
import { lazy, Suspense } from "react";

const Redesign = lazy(() => import("./redesign/FounderRedesign"));
const App = lazy(() => import("./App.tsx"));
const isRedesign = /^\/redesign(?:\/|$)/.test(window.location.pathname);

createRoot(document.getElementById("root")!).render(
  <ThemeProvider attribute="class" defaultTheme="system" enableSystem>
    <Suspense fallback={<div role="status">Cargando CloudValley…</div>}>
      {isRedesign ? <Redesign /> : <App />}
    </Suspense>
  </ThemeProvider>,
);
