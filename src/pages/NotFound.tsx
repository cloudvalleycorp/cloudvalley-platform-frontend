import { Link, useLocation } from "react-router-dom";
import { useEffect } from "react";
import { BrandMark } from "@/components/BrandMark";
import { Button } from "@/components/ui/button";

const NotFound = () => {
  const location = useLocation();

  useEffect(() => {
    console.error("404 Error: User attempted to access non-existent route:", location.pathname);
  }, [location.pathname]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-6">
      <BrandMark />
      <div className="text-center space-y-5">
        <h1 className="text-3xl font-medium tracking-tight">Página no encontrada</h1>
        <p className="text-sm text-muted-foreground">
          El enlace puede estar roto o la página ya no existe.
        </p>
        <Button asChild>
          <Link to="/">Volver al inicio</Link>
        </Button>
      </div>
    </div>
  );
};

export default NotFound;
