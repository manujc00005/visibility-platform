# Visibility Platform

Diagnóstico SEO y de visibilidad en buscadores con IA para pymes. Producto independiente de `lead-platform`.

Estado y orden de trabajo: [docs/visibility-mvp/16-implementation-roadmap.md](docs/visibility-mvp/16-implementation-roadmap.md).

## Requisitos

- Node.js 22 o superior.
- Una base de datos PostgreSQL: Neon (objetivo) o un Postgres 16 local para desarrollo.

## Arranque

```bash
npm install
cp .env.example .env.local   # rellenar DATABASE_URL
npm run db:migrate
npm run dev
```

Postgres local opcional para desarrollo y pruebas:

```bash
docker run -d --name visibility-postgres -e POSTGRES_USER=visibility -e POSTGRES_PASSWORD=visibility -e POSTGRES_DB=visibility -p 127.0.0.1:5433:5432 postgres:16
```

## Generación de PDF

Los informes se imprimen con Chromium headless. Después de `npm install`, instala el navegador una vez:

```bash
npx playwright-core install --only-shell chromium
```

## Pruebas de integración

Usan una base separada: rama Neon `test`, base `visibility_test`, configurada en `.env.test.local`
(variable `TEST_DATABASE_URL`, ver `.env.example`). Antes de la primera ejecución:

```bash
npm run db:test:prepare
```

Una guardia impide escribir en cualquier base cuyo nombre no termine en `_test` o que no lleve la
marca de pruebas; `production` y `dev` no cumplen ninguna de las dos.

## Scripts

| Script | Uso |
|---|---|
| `npm run dev` | Servidor de desarrollo |
| `npm run build` | Build de producción |
| `npm run lint` | ESLint |
| `npm run typecheck` | Genera tipos de rutas y ejecuta `tsc` |
| `npm test` | Pruebas unitarias e integración. La integración es obligatoria y falla si falta `TEST_DATABASE_URL` |
| `npm run test:unit` / `npm run test:integration` | Cada grupo por separado |
| `npm run db:test:prepare` | Marca la base de pruebas y aplica migraciones (solo bases `*_test`) |
| `npm run check` | Lint + typecheck + pruebas |
| `npm run db:generate` | Genera una migración desde el esquema Drizzle |
| `npm run db:migrate` | Aplica migraciones pendientes |

## Estructura

```
src/
  app/            rutas, layout y route handlers (presentación)
  components/     UI (shadcn/ui en components/ui) y layout
  config/         entorno validado con Zod
  db/             cliente Drizzle, esquema y migraciones
  lib/            utilidades transversales (logger)
  modules/        dominio y servicios por módulo
tests/            unit/ e integration/
```

`GET /api/health` devuelve solo `{"status":"ok"|"degraded"}` (200/503).
