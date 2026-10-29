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
  - Repetido 2026-10-29 sobre `HEAD` (`bbdc50a`, con i18n, Bing, GA4 y el scope configurable), en un worktree desechable sin cambios ajenos: lint sin errores (un aviso previo, `_formatted` en `es.ts`), typecheck limpio, 658 unitarias, 97 de integración y build correcto.
- [x] T009 Navegador: estado sin configurar y, con credencial, datos reales de olessium.com
  - Hecho 2026-10-27: «Sin configurar»; llamada real a Google con una clave desechable, rechazada y explicada como `invalid_credentials`; vista con datos sobre una empresa de prueba temporal (cifras, cambios, tablas, búsqueda con HTML pintada como texto, móvil sin scroll horizontal). Datos de prueba borrados.
  - Hecho 2026-10-29 con la credencial real (`gsc-reader@olessium.iam.gserviceaccount.com`), que ya tenía acceso (D006): «Actualizar datos» en Olessium (un intento guardado en `dev`) usa `sc-domain:olessium.com`, del 29 sept al 26 oct de 2026, con 0 clics, 0 impresiones y «Sin búsquedas en este periodo». Search Console muestra lo mismo para el 1 sept–26 oct (0 clics, 0 impresiones, consultas «Sin datos»; el gráfico empieza el 26 oct). `es` y `en`; a 375 px sin scroll horizontal. La tarjeta del resumen dice «En Google: sin impresiones en los últimos 28 días (Search Console)» (AC-004).

## Follow-ups

- Mejoras de la vista que dejaron las revisiones de cierre (D007): estado vacío cuando los dos periodos están a cero, aviso de configuración cuando hay datos guardados y la credencial falta o no vale, día del Pacífico en `periodsFor`, prueba de render de la sección y prueba de que la fila guardada no lleva el token. Necesitan enmendar la spec.
- Cuando Search Console tenga impresiones de olessium.com: «Actualizar datos» y comparar clics, impresiones, CTR, posición, búsquedas y páginas con el informe de Rendimiento del mismo periodo, y revisar las tablas con filas a 375 px (D006).
