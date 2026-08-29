# CloudValley

TODO: Document your project here

## Setup local

1. `npm install`
2. `cp .env.example .env` y completá los valores reales (ver
   [docs/security-env-vars.md](docs/security-env-vars.md) para el detalle de
   cada variable y qué puede ser público).
3. `git config core.hooksPath .githooks` — activa el pre-commit que bloquea
   commitear `.env` por error.
4. `npm run dev`
