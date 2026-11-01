# Tasks: Inicio y panel de fuentes de datos

## Phase 1: Preparation

- [x] T001 - Raíz a `/workspaces`, `/admin/status`, cabecera sin «Inicio». Covers: AC-001. Verify: typecheck y navegador.

## Phase 2: Implementation

- [x] T002 - `auditProviderConfig` y `summarizeSources` con pruebas. Covers: AC-002, AC-003. Verify: `tests/unit/sources/summary.test.ts` en verde.
- [x] T003 - `SourcesPanel` y página de edición. Covers: AC-004. Verify: `tests/unit/sources/panel-render.test.ts` en verde.
- [x] T004 - Textos de `providerStatus` sin variables; catálogos. Covers: AC-005. Verify: `grep` y pruebas de catálogo.

## Phase 3: Tests

- [x] T005 - Navegador sobre `dev`. Covers: AC-001, AC-006. Verify: registrar lo observado.
- [x] T006 - Suite completa y build. Covers: AC-007.

## Phase 4: Review

- [x] T007 - Revisiones de frontend/QA y conformidad; hallazgos corregidos.
- [x] T008 - Roadmap (§8) y cierre.

## Evidence

Fecha: 2026-11-01, en `dev` y en el navegador integrado (interfaz en inglés por la cookie de la sesión; servidor de desarrollo del puerto 3000 ya abierto).

- T001 (`8fcf2d0`): `src/app/page.tsx` redirige; `src/app/admin/status/page.tsx` conserva estado del sistema y hoja de ruta con título «Estado del sistema»; la cabecera tiene solo «Empresas» y la marca enlaza a `/workspaces`; `header.home` retirado. `header.test.ts` comprueba el ítem activo en `/workspaces`, que no hay «Inicio» ni enlace a `/`, y que en `/admin/status` ningún ítem está activo.
- T002: `auditProviderConfig` devuelve solo booleanos. `tests/unit/sources/summary.test.ts`, 7 pruebas: cinco filas en orden con enlaces; etiquetas y tonos de Search Console (`empty`), Bing (`processing`) y GA4 (`ok`) con propiedad y última lectura; orden fallo → aviso de configuración → motivo; estados de credencial de Search Console; PageSpeed sin clave, medido, parcial y analizando; IA solo demo, medida con automático disponible y recogiendo; inglés.
- T003: `tests/unit/sources/panel-render.test.ts`: tabla con `caption`, cinco filas con `scope="row"`, pills, fechas, «Nunca», enlaces, y una nota hostil escapada; cabeceras en inglés.
- T004: `geo.providerStatus` sin nombres de variables en `es` y `en`; `grep -n "DATAFORSEO_\|GEO_MONTHLY_BUDGET" src/i18n/messages/*.ts` no devuelve nada (las instrucciones de configuración de Search Console y Bing nombran sus propias variables, D003).
- T005 (navegador): `GET /` acaba en `/workspaces` con un único ítem «Companies» en la cabecera; `/admin/status` muestra «System status» y la hoja de ruta. Edición de Olessium: Search Console «No impressions · sc-domain:olessium.com · 30 Oct 2026, 19:38» con el motivo del estado vacío; Bing «Processing · https://olessium.com/ · 1 Nov 2026, 13:40»; GA4 «Connected · Olessium web · 31 Oct 2026, 22:31» sin pendientes; PageSpeed «Measured · 28 Oct 2026, 10:27»; IA «No measurements · Assisted capture · Never» con la frase de solo demostración. Clínica: «No data» en Search Console, Bing y GA4 con la acción de cada una, PageSpeed «Not measured» por portada ilegible, IA «Not set up». A 375 px la página no desborda (`scrollWidth` 375) tras poner `relative` en el marco de la tabla: el encabezado `sr-only` de la última columna, posicionado en absoluto, ensanchaba el documento hasta 910 px.
- T006: lint (0 errores; el aviso de `es.ts` es anterior), typecheck, `npm run test:unit` (84 ficheros, 1.191 pruebas) y `npm run build` en verde. Integración en solitario dos veces: a las 16:50 sobre `8fcf2d0` y a las 17:00 sobre `054d47e`, 14 ficheros y 266 pruebas cada vez. Mientras la otra sesión del worktree `visibility-platform-a11y` ejecutaba la suya se esperó sin lanzar (D-39).
- T007: conformidad «Pass con menores» y frontend/QA «Reject» por tres medios sin altos; lo aplicado y lo descartado está en D004 y en `054d47e`. Tras las correcciones, la edición de Olessium sigue mostrando los cinco estados y `/admin/status` titula «System status».
- T008: roadmap (cabecera y §8); SPEC en Done.
