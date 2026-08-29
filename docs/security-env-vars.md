# Variables de entorno y secretos

## Setup local

1. Copiá `.env.example` a `.env`: `cp .env.example .env`.
2. Completá los valores reales (pedilos a otro miembro del equipo o sacalos
   del dashboard de Supabase: Project Settings > API).
3. `.env` está en `.gitignore` y **nunca** debe commitearse. Si `git status`
   te muestra `.env` como archivo nuevo para trackear, algo está mal
   configurado: no hagas `git add` igual, avisá al equipo.

## Qué variable es pública y cuál no

Vite expone al bundle del navegador **cualquier** variable con prefijo
`VITE_` (queda embebida en el JS que se sirve a cualquier visitante del
sitio, se haya commiteado `.env` o no). Por eso:

| Variable | Expuesta al browser | Es sensible |
|---|---|---|
| `VITE_SUPABASE_PROJECT_ID` | Sí | No — es el identificador público del proyecto |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Sí | No — es la clave `anon` de Supabase, diseñada para uso público en frontend. La protección real de los datos es Row Level Security (RLS) en Postgres, no el secreto de esta clave |
| `VITE_SUPABASE_URL` | Sí | No — URL pública del proyecto |
| `VITE_API_BASE_URL` | Sí | No — hostname público del gateway de API |

**Ninguna de las variables `VITE_*` de este proyecto debe considerarse
secreta.** Si en algún momento se necesita agregar una credencial que sí deba
permanecer privada (API key de un servicio de terceros, credencial de
service_role, etc.), **no la pongas en una variable `VITE_*`** — eso la
manda directo al navegador de cualquier usuario. En su lugar:

- Guardala como secret de Supabase Edge Functions (`supabase secrets set`) y
  leela server-side con `Deno.env.get(...)` — así ya se hace con
  `SUPABASE_SERVICE_ROLE_KEY` en `supabase/functions/*`. Nunca importes esa
  clave desde código que corre en el browser.
- O agregá un endpoint propio en el backend (Cloud Functions detrás de
  `api.cloudvalley.vc`) que el frontend consuma sin ver la credencial:
  `Frontend → Backend propio → Servicio externo`, nunca
  `Frontend → Servicio externo con secreto embebido`.

## Si accidentalmente commiteaste un secreto real

1. Avisá al equipo de inmediato, no lo intentes resolver solo en silencio.
2. El secreto se considera comprometido apenas queda en un commit, aunque
   sea en una rama local: rotalo/revocalo en el servicio de origen antes que
   nada, no alcanza con borrar el archivo.
3. Si el commit ya se pusheó, hace falta reescribir el historial (`git
   filter-repo` o equivalente) y forzar el push a todas las ramas remotas
   afectadas — coordinalo con el equipo antes de hacerlo, es una operación
   destructiva para cualquiera que tenga un clone.
4. El pipeline de CI corre Gitleaks (`.github/workflows/secret-scan.yml`) en
   cada push y PR; si detecta un secreto nuevo, el build falla.
