# Búsquedas que sigues — implementación 010

En curso, 2026-10-31. Commits locales, sin subir ni desplegar. Base y copias de los archivos con cambios previos de 004 registradas en `/tmp/visibility-010-implementation-base/` (HEAD y hashes; sin secretos). Solo se editan fragmentos de 010 en los archivos compartidos.

## Evidencia por tarea

- T001: red inicial por módulo inexistente; después 44 pruebas de keywords/brand-terms en verde. Normalización Unicode, puntos de código, presupuesto exacto 4096/4097, ponderación/variantes, fechas, huecos y filas inválidas. Expresiones de marca existentes conservadas.

- T002–T005: migración `0012` en `test` y `dev`; servicio, colector y resumen en verde. Ver las notas de TASKS y D013, que recoge los textos invertidos que encontró la revisión.

- T006–T008: ver las notas de TASKS. Código en `639e8cc`; comprobaciones sobre `ed598a0`.

- T009, parcial: `npm run lint`, `typecheck`, `test:unit` (900), `test:integration` (188) y `build` con código 0 sobre `ed598a0`. Correcciones de las revisiones en D014. Migraciones `0012` y `0013` en `test` y `dev`.

## Captura real, 2026-10-31

Lectura de solo lectura de `sc-domain:olessium.com` con tres búsquedas, sin guardar nada, para no instalar datos en `dev`. Rango 2026-10-01 a 2026-10-28, ventana desde 2026-04-30. Resultado `completed`, 0 impresiones, 0 búsquedas y las tres series vacías.

**Esto no prueba el filtro.** Google respondió 200 a una expresión con `(?:…|…)`, `[\s\p{Z}]+` y escapes, pero D007 de la 007 ya comprobó que la API acepta incluso expresiones inválidas cuando no hay datos.

## Límites de cierre

AC-017 exige un positivo real con impresiones conocidas. No se considera superado por mocks ni por una respuesta vacía. No se modifica la base dev ni producción para instalar fixtures.
