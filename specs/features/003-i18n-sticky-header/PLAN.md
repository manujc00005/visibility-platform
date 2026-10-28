# Implementation Plan: Interfaz bilingüe con cabecera fija

## Summary

Añadir un módulo `src/i18n/` propio (sin dependencias) con catálogos tipados en español e inglés, resolver el idioma por petición desde una cookie (con negociación `Accept-Language` como respaldo) en el layout raíz, y rehacer `AppHeader` como cabecera fija con enlace para saltar al contenido, navegación con estado activo y selector de idioma por formulario. Después, migrar los textos de páginas, componentes y módulos puros al catálogo con parámetro `locale` por defecto `"es"`, traducir los hallazgos por `ruleId` al mostrarlos y centralizar los formatos `Intl`. El informe PDF, el proxy, las rutas y el esquema no cambian. Los contratos detallados de parámetros, props y excepciones están en SPEC.

## Related spec

`specs/features/003-i18n-sticky-header/SPEC.md`. Decisiones en `DECISIONS.md` (D001–D018; D003/D004/D005/D008/D009 sustituidas según el registro).

## Impacted areas

- **Nuevo** `src/i18n/`: `locale.ts` (`Locale`, `SUPPORTED_LOCALES`, `DEFAULT_LOCALE`, `resolveLocale`), `server.ts` (`getLocale` con `cookies()`/`headers()`), `messages/es.ts`, `messages/en.ts`, `messages/index.ts` (`getMessages`, tipo `Messages`), `format.ts` (fecha, hora, número, duración, bytes, país), `findings.ts` (`findingText`, contexto y adaptador de parámetros históricos), `client-format.ts` (plantillas serializables y plurales), `actions.ts` (`setLocaleAction`).
- **Layout y cabecera**: `src/app/layout.tsx` (`instant = false`, `generateMetadata`, `<html lang>`, `main#contenido`), `src/app/globals.css` (`--header-height`, `scroll-padding-top`), `src/components/layout/app-header.tsx` (fija), nuevos `src/components/layout/header-nav.tsx` (cliente) y `language-switcher.tsx` (servidor), `skip-link` dentro de `app-header`.
- **Páginas** (`src/app/**`): `page.tsx`, `not-found.tsx`, `workspaces/page.tsx`, `workspaces/new/page.tsx`, `workspaces/actions.ts`, `workspaces/[id]/{page,not-found}.tsx`, `edit`, `audits/actions.ts`, `audits/[auditId]/{page,actions}.ts(x)`, `performance`, `seo`, `geo/{page,actions}.ts(x)`, `geo/setup`, `geo/runs/[runId]`.
- **Componentes**: `audits/{evolution-chart,run-audit-button,status-ui}.tsx`, `geo/{geo-forms,competitor-suggestions}.tsx`, `overview/{opportunities,overview-card,page-header,workspace-nav}.tsx`, `page-loading.tsx`, `system-status.tsx`, `reports/generate-report-button.tsx`, `workspaces/workspace-form.tsx`.
- **Módulos puros** (parámetro `locale` opcional): `audits/{presentation,status,rules}.ts` (rules solo cambia la procedencia de sus textos), `geo/{presentation,budget,service,competitors/service}.ts`, `workspaces/{presentation,validation,domain}.ts`, `overview/{types,performance,seo,ai,opportunities}.ts`.
- **Pruebas**: nuevas en `tests/unit/i18n/`, con corpus previo independiente en `tests/unit/i18n/fixtures/`; existentes intactas.
- **Documentación**: nueva `docs/visibility-mvp/18-i18n-and-header.md` (diseño, verificación, capturas en `assets/18-i18n/`), nota en `16-implementation-roadmap.md`.
- **Search Console (D019)**: `src/modules/search-console/summary.ts` (`locale`), `credentials.ts` y `deps.ts` (código del motivo de configuración no válida, sin cambiar la validación), `src/components/search-console/{search-console-section,refresh-button}.tsx`, `src/app/workspaces/[id]/seo/{page,actions}.tsx`, tarjeta SEO de `src/app/workspaces/[id]/page.tsx`; pruebas nuevas en `tests/unit/search-console/`.

## Context budget

### Reading list

- Los cuatro documentos de esta feature.
- `src/app/layout.tsx`, `src/components/layout/app-header.tsx`, `src/components/overview/workspace-nav.tsx` (estilo del estado activo), `src/app/globals.css` (tokens).
- `src/proxy.ts` solo para confirmar que no hay que tocarlo; `src/app/not-found.tsx`.
- Para cada tarea de migración, únicamente los archivos listados en esa tarea; búsquedas con `rg` como inventario auxiliar clasificado según D017, incluyendo palabras españolas sin acentos; no exigir cero coincidencias ni revisar áreas aún no migradas.
- `src/modules/audits/rules.ts` completo para extraer el catálogo de hallazgos; `tests/unit/audits/rules.test.ts` para confirmar salida idéntica.
- Documentación Next consultada el 2026-10-27: `functions/cookies`, `messages/blocking-prerender-runtime`, `functions/next-root-params`, `guides/internationalization`. No hace falta releerla salvo que T001 falle.

### Model routing

Un solo agente con el modelo actual, sin cambio de modelo ni delegación en este plan. Lectura acotada por tarea; ampliar solo para resolver un tipo, dependencia o fallo concreto. Sin herramientas de pago.

## Proposed approach

1. **Spike (T001).** Tras acreditar D011, probar la lectura de cookie en el layout raíz y el árbol completo, incluidas `/`, `/workspaces`, `/workspaces/new` y `/_not-found`. Aplicar D016: registrar variante que compila, salida del build, GET/HEAD, lang y cuerpo con cookies es/en y sin cookie. El 404 bilingüe no exime el layout; si este falla, T001 no se cumple y no avanzan las tareas posteriores.
2. **Núcleo i18n (T002).** Resolver todos los casos ponderados de SPEC. Catálogos con espacios `common`, `header`, `home`, `notFound`, `workspaces`, `audits`, `overview`, `performance`, `seo`, `geo`, `validation`, `findings`; contratos tipados sin fijar literales españoles; tipos de props serializables y `client-format.ts`. Completar al menos common/header/notFound; cada migración completa su espacio en ambos idiomas antes de enviar props. Definir `findingText` y su contexto con la implementación de parámetros/corpus en T005. Cookie/action y formatos mantienen los contratos de SPEC.
3. **Cabecera (T003).** AppHeader/LanguageSwitcher de servidor; HeaderNav es la única frontera cliente nueva. Comprobar foco, skip link (`main#contenido` enfocable con `tabIndex=-1`), sticky, anclas y selector con/sin JavaScript a 1280/375 px. Etiquetas cliente serializables, sin funciones de mensajes.
4. **Migración por áreas (T004–T007).** Funciones puras con locale por defecto es y esquemas por fábrica; mensajes dinámicos de servidor ya evaluados y plantillas cliente según D015. Formatos de interfaz centralizados; evidencia/normalización conservadas. Revisar con rg los archivos listados de la tarea, clasificar coincidencias en doc 18 y comprobar DOM visible/accesible con datos y errores. No usar la búsqueda de tildes como prueba de idioma.
5. **Hallazgos (T005).** Primero construir corpus de entradas y objetos completos de salida del rules.ts previo en `tests/unit/i18n/fixtures/`; verificar ids/variantes contra el código. Después extraer plantillas y parámetros sin modificar la salida española. Completar el adaptador de `findingText(finding, locale, context?)`, pasando facts/rulesVersion del mismo audit en auditoría y módulos overview; T006 cubre sus vistas. Contexto insuficiente/antiguo devuelve textos originales con bandera fallback y aviso; sin regex de prosa ni nuevos datos. Pruebas del corpus exacto y escenarios ingleses de SPEC.
6. **Search Console (T009, D019).** Mismo patrón que T004–T007: `summary.ts` con `locale` por defecto `es` y salida española idéntica salvo los textos de fallo, que salen del catálogo por `errorKind` (enmienda de D019) (incluido el agrupamiento de miles de `toLocaleString("es-ES")`), textos del catálogo en la sección (componente de servidor) y etiquetas por props en el botón cliente, errores del action con `getLocale()`. Motivo de configuración no válida por código.
7. **Correcciones de revisión (T010).** Hallazgos CONF-004 a CONF-009 de `/spec-review`: código sin uso, aviso del overview, placeholder, prueba de tipos, concatenaciones y comentarios.
8. **Cierre (T008).** Ejecutar checks y verificación renderizada final, inventario de excepciones D017, contrato de props, revisión humana AC-015, doc 18 y roadmap. No cerrar sin evidencia. Comparar rendimiento local de inicio/listado con mediciones previas a T001 bajo el mismo entorno y volumen, registrando cifras sin prometer escalabilidad.

## Alternatives considered

- **`app/[lang]/` + `next/root-params`** (recomendación oficial): rechazada por el coste de mover rutas, URLs y proxy en una herramienta privada sin SEO (D001). Queda como opción futura.
- **`next-intl` u otra librería**: añade dependencia, convenciones de mensajes ICU y middleware propios para un catálogo de dos idiomas que TypeScript ya puede validar (D015).
- **Script pre-pintado para `<html lang>`**: evita bloquear el layout pero añade JavaScript y un parpadeo de idioma; rechazado (D001).
- **Traducir la evidencia guardando datos estructurados**: cambia esquema y reglas; fuera de alcance (D014).
- **Idioma como atributo de la empresa**: la herramienta no tiene usuarios ni cuentas; el idioma es del lector, no de la empresa auditada (D013).

## Dependencies

- Consolidar el árbol de trabajo de 002 antes de T001 (D011). Sin esto, los diffs de ambas features se mezclan.
- Next 16.4.3 instalado (`instant` en layout disponible desde 16.3). Sin librerías nuevas.
- Propietario del proyecto disponible para la revisión de copia inglesa (AC-015).

## Risks

- **Build en rojo por «runtime data» en rutas no bloqueantes o `/_not-found`**: puerta T001/D016: el fallback de 404 solo sirve si todo el árbol compila; si no, no se continúa.
- **Regresión de textos**: una traducción incompleta pasa desapercibida si una página concatena texto fuera del catálogo. Mitigación: tipos, pruebas de mensajes/props, inventario clasificado D017 y comprobación de DOM/capturas (AC-001/011/017).
- **Cambio accidental de la salida de `rules.ts`** al mover los textos: mitigación: corpus de salida completo capturado antes de la extracción, pruebas originales intactas y RULES_VERSION idéntica (AC-008). No bastan las aserciones parciales existentes.
- **Funciones en props o pérdida de parámetros históricos**: contratos D014/D015, pruebas de tipo y build/navegador, contexto del mismo audit y fallback explícito.
- **Conflictos con 002**: mitigación D011; no cumplida mientras no se registre la consolidación y el estado pendiente de 002.
- **Pérdida de lo escrito en un formulario al cambiar idioma**: límite declarado en SPEC «Edge cases»; no se mitiga en P0.
- **Calidad de la copia inglesa**: mitigación AC-015 (revisión humana obligatoria antes del cierre).
- **Rendimiento**: cookie en el layout puede reducir el shell prerenderizado; `instant = false` por sí solo no desactiva el prerenderizado. T001 registra el comportamiento real. Medir en T008 que el tiempo local de `/` y `/workspaces` no empeora de forma apreciable (registrar cifras, sin prometer escalabilidad).
- **Fusión de PR #1 sobre el árbol sin commitear (D019)**: el `pull` con autostash mezcló 003 con Search Console en `[id]/page.tsx` y `seo/page.tsx`. Mitigación: repetir checks y verificación renderizada sobre el árbol fusionado (T008) y commitear 003 separado de `eslint.config.mjs` y del cambio ajeno de `.gitignore`.

## Test strategy

- **Unit** (`tests/unit/i18n/`): matriz ponderada completa de idioma; catálogos completos/no vacíos, con ejecución de funciones representativas; plantillas/plurales cliente; formateadores; esquemas y overview en en. `findingText` cubre cada parámetro, variante, contexto inexistente/versión no soportada y regla desconocida. Prueba de completitud de ids/variantes y corpus previo de salidas completas (AC-008/009).
- **Tipos**: quitar clave inglesa rompe typecheck; una prueba de tipos con error esperado demuestra que ClientMessages rechaza funciones, también anidadas; las firmas permiten valores ingleses distintos de los literales españoles.
- **Existentes**: suites con textos españoles pasan sin modificar aserciones (AC-012); el número actual de suites no es un criterio fijo.
- **Integration**: ejecutar suite completa en T008, sin tocar la base de desarrollo para insertar fixtures sintéticos.
- **Navegador**: build/start real; GET/HEAD y cuerpos/lang en páginas normales y 404; cabecera/selector con/sin JS, foco y anclas, formularios/sugerencias dinámicos sin errores RSC. Capturas 1280/375 en ambos idiomas para inicio/listado, overview, rendimiento, SEO, GEO/configuración/run, auditoría y 404. Registrar DOM visible y accesible y excepciones por vista, no solo capturas. Cada tarea verifica únicamente las áreas que migra.
- **Humana**: AC-015 con fecha y correcciones en doc 18; sigue siendo requisito de cierre, no evidencia ya obtenida.

## Source of truth and reviews

Aplicar la matriz de SPEC. Revisiones antes del cierre: frontend/QA, lógica de idioma y parámetros, seguridad y contrato del server action, alcance por empresa/auditoría de los facts, y rendimiento/bundle. No hay cambios de esquema ni endpoints nuevos. Revalidar idioma no ejecuta capturas ni llamadas a proveedores.

## Rollback strategy

Todo es código de aplicación sin migraciones. Revertir el commit (o los commits por tarea) devuelve la interfaz española y la cabecera anterior. Como desactivación parcial, basta con que `getLocale()` devuelva siempre `DEFAULT_LOCALE`: la cookie existente en los navegadores se ignora y no hace daño. No hay datos que limpiar.

## PLAN verification checklist

- [x] The plan covers all acceptance criteria.
- [x] The plan avoids behavior outside the spec.
- [x] The Context budget section is filled (reading list + model routing), not left as placeholder.
- [x] Risks are documented.
- [x] Test strategy is documented.
- [x] Rollback strategy is documented.
- [x] El estado de SPEC lo gestionan las skills del ciclo (hoy `Done`); D011 quedó acreditada en `425e23b` (doc 18 §1).
