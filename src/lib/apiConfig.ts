// Única fuente de verdad para el host de la API (Cloud Functions detrás del
// gateway). Todo módulo que exporta una constante *_URL debe construirla a
// partir de esta base, nunca repetir el dominio a mano — así un cambio de
// dominio (como el de auth-gateway-2rte326z.uc.gateway.dev →
// api.cloudvalley.vc) es un solo lugar, no una búsqueda y reemplazo por
// decenas de archivos.
export const API_BASE_URL = import.meta.env.VITE_API_BASE_URL || "https://api.cloudvalley.vc";
