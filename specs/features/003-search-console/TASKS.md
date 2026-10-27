# Tasks: Conector de Google Search Console

## Phase 1: Core

- [x] T001 Variable de entorno y redacción en logs
- [x] T002 Credencial y JWT (`credentials.ts`, `google.ts`) con pruebas
- [x] T003 Recogida: periodos, propiedad, consultas (`collect.ts`) con pruebas

## Phase 2: Persistence and UI

- [x] T004 Tabla, migración `0006` y servicio, con integración
- [x] T005 Resumen (`summary.ts`) con pruebas
- [x] T006 Pestaña Google, acción y botón
- [x] T007 Línea de la tarjeta del resumen

## Phase 3: Verification

- [x] T008 Lint, typecheck, unitarias, integración y build (501 pruebas, 48 archivos; build correcto)
- [ ] T009 Navegador: estado sin configurar y, con credencial, datos reales de olessium.com
  - Hecho 2026-10-27: «Sin configurar»; llamada real a Google con una clave desechable, rechazada y explicada como `invalid_credentials`; vista con datos sobre una empresa de prueba temporal (cifras, cambios, tablas, búsqueda con HTML pintada como texto, móvil sin scroll horizontal). Datos de prueba borrados.
  - Pendiente: credencial real y acceso a la propiedad de olessium.com.
