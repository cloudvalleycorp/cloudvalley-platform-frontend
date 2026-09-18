import { Navigate } from "react-router-dom";

// /account se fusionó dentro de /settings (mockup aprobado: un solo shell
// de Configuración con Perfil/Startup/Miembros/Integraciones/Privacidad,
// sin pantalla "Mi cuenta" aparte) — ver ProfileSection.tsx. Se mantiene
// como redirect, no 404, por los links/bookmarks viejos.
export default function Account() {
  return <Navigate to="/settings" replace />;
}
