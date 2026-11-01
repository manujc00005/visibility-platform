# Tasks: Objetivo comercial por empresa

## Phase 1: Preparation

- [x] T001 - Tabla `workspace_goals`, migración 0018 y servicio (`getGoal`, `saveGoal`, `removeGoal`, `goalEvidence`) con pruebas de integración. Covers: AC-001, AC-002, AC-003.

## Phase 2: Implementation

- [x] T002 - `summarizeGoal` con pruebas. Covers: AC-004.
- [x] T003 - Acciones, `GoalForm` en la edición y `GoalLine` en el resumen; catálogos. Covers: AC-005.

## Phase 3: Tests

- [x] T004 - Migrar `dev` y verificar en navegador. Covers: AC-006.
- [x] T005 - Suite completa y build. Covers: AC-007.

## Phase 4: Review

- [x] T006 - Revisiones de base de datos, frontend/QA y conformidad; hallazgos corregidos.
- [x] T007 - Roadmap (§8) y cierre.

## Evidence

Fecha: 2026-11-01, en `dev` y en el navegador integrado (interfaz en inglés por la cookie de la sesión; servidor de desarrollo del puerto 3000 ya abierto).

- T001 (`be6ce03`): migración `0018_workspace_goals` generada con drizzle-kit y aplicada en `dev`. `tests/integration/goals.test.ts`: una fila por empresa, evento recortado, actualización sin cambiar `createdAt`, `validation` sin escribir (`es` y `en`), `not_found`, borrado idempotente, cascada, los tres `CHECK` por nombre con cinco formas inválidas; `goalEvidence` devuelve la captura buena más reciente con el evento mayor que cero e ignora ceros, capturas sin eventos clave, capturas fallidas, otros eventos, otra empresa, mayúsculas y nombres hostiles (`" || true || "`, `$event`).
- T002: `tests/unit/goals/summary.test.ts`: sin objetivo; pendiente sin capturas con la nota de conectar; pendiente con captura que no lo vio, con y sin aviso de evento no configurado y con `configuredMore`; verificado con la cifra de la última captura (2, 0 y sin eventos clave) y la última recepción; prohibición de «clientes», «ventas» y «leads» en los dos idiomas.
- T003: `tests/unit/goals/render.test.ts`: línea en los tres estados con pill, notas y enlace a la edición, texto hostil escapado; formulario con los eventos configurados como opciones, el guardado primero aunque GA4 ya no lo liste, campo de texto cuando no hay eventos, formulario de quitar solo con objetivo. La frase «Objetivo actual» se compone en el servidor (`goals.current`) porque el fragmento del cliente solo lleva cadenas: la primera versión pasaba la función y el servidor de desarrollo lo rechazó.
- T004 (navegador): edición de Olessium con el selector de eventos (`close_convert_lead`, `qualify_lead`, `purchase`); guardado «Solicitud de contacto» sobre `close_convert_lead` → «Goal saved.» y «Current goal: Solicitud de contacto (request), measured by the event close_convert_lead.»; resumen de Olessium: «Pending · Solicitud de contacto: measurement still to be verified. Google Analytics has not recorded any reception of this event from search engines yet. Edit». Clínica: campo de texto («book_appointment»), guardado, resumen «Pending · Cita de primera visita: … Connect Google Analytics to verify it.»; «Remove goal» → «Goal removed.» y el resumen vuelve a «Not defined · Commercial goal not defined. Define it». A 375 px, resumen y edición de Olessium sin desbordamiento (`scrollWidth` 375). El objetivo de Olessium queda guardado en `dev` como ejemplo real.
- T005: lint (0 errores; el aviso de `es.ts` es anterior), typecheck, `npm run test:unit` (86 ficheros, 1.201 pruebas) y `npm run build` en verde. Integración: la primera pasada completa (17:34) falló en 5 ficheros por tiempos de espera de varios minutos con la base de pruebas lenta; la repetición con la base libre (20:01) pasó 274 de 275, con la única caída en la prueba intermitente de concurrencia de auditorías (D-24, BL-06), que junto a `goals.test.ts` pasó en solitario (18 de 18) tras las correcciones.
- T006: conformidad «Pass con menores» y base de datos/frontend «Reject» por un medio; aplicado y descartado en D004 y en `1650853`. Tras las correcciones, en navegador: guardar «Cita de primera visita» en la clínica y quitarla en la misma página deja «Goal removed.», sin «Goal saved.», sin botón de quitar y con los campos vacíos.
- T007: roadmap (cabecera y §8); SPEC en Done.
