# Feature Spec: Conector de Google Search Console

## Status

In Progress (2026-10-27). Implementado y probado; falta la verificación con la credencial real y datos reales de olessium.com (T009).

## Problem

La pestaña «Google» y la tarjeta «Visibilidad en Google» solo muestran la salud técnica de la portada. No dicen cuántas personas encuentran la empresa en Google ni con qué búsquedas. La propia interfaz lo admite: «Posicionamiento todavía no medido: falta conectar Google Search Console».

## Goal

El operador pulsa un botón en la ficha de una empresa y obtiene, desde la API oficial de Search Console, los clics, impresiones, CTR y posición media de los últimos 28 días, la comparación con los 28 días anteriores, las búsquedas principales y las páginas principales. Los datos se guardan y la página los muestra sin volver a llamar a Google.

## Non-goals

- OAuth del propietario, pantalla de consentimiento o tokens de usuario guardados (D001).
- Elegir a mano la propiedad de Search Console (se resuelve por dominio, D003).
- Incluir los datos en el informe PDF.
- GA4, Bing Webmaster Tools, DataForSEO SERP o rastreo de más páginas.
- Ejecuciones programadas o histórico diario (llega con la Fase 6).
- Cambiar el titular ni el semáforo de la tarjeta «Visibilidad en Google».

## Users / Actors

- Operador: configura la credencial una vez, da acceso en Search Console y pulsa «Traer datos».
- Google: OAuth 2.0 (token) y Search Console API v3 (lista de propiedades y Search Analytics). `capture_condition = owner_api`.

## Current behavior

- `src/app/workspaces/[id]/seo/page.tsx`: sección «Posicionamiento en Google» con «No disponible todavía».
- `src/app/workspaces/[id]/page.tsx`, `SeoCard`: línea fija «Posicionamiento todavía no medido…».

## Desired behavior

1. Sin credencial: la sección dice «Sin configurar» y explica los dos pasos (variable de entorno y añadir la cuenta como usuario).
2. Con credencial y sin datos: botón «Traer datos de Search Console».
3. Tras traer datos: cuatro cifras con su cambio, tabla de búsquedas, tabla de páginas, propiedad usada, periodo y fecha de captura. Botón «Actualizar datos».
4. Si falla: el último intento fallido se muestra con un motivo accionable; los datos buenos anteriores siguen visibles.
5. Tarjeta del resumen: la línea fija se sustituye por clics e impresiones de 28 días cuando hay datos.

## Functional requirements

- FR-001 La credencial es una clave JSON de cuenta de servicio en `GSC_SERVICE_ACCOUNT_JSON`, en crudo o en base64. Se valida al usarla; un JSON inválido da `invalid_credentials`, nunca un fallo de arranque.
- FR-002 El token se obtiene con un JWT RS256 firmado con `node:crypto`, `aud` y endpoint fijos `https://oauth2.googleapis.com/token`, scope `webmasters.readonly`, vida de 1 hora. Se ignora `token_uri` del archivo.
- FR-003 La propiedad se elige entre las que la cuenta puede leer (`siteOwner`, `siteFullUser`, `siteRestrictedUser`), por prioridad: `sc-domain:<dominio>`; `https://<host>/`; `https://<dominio>/`; `https://www.<dominio>/`; las mismas en `http://`.
- FR-004 Periodo actual: 28 días que terminan 3 días antes de la fecha UTC de la captura. Periodo anterior: los 28 días previos. `dataState = final`, `type = web`.
- FR-005 Cuatro consultas: totales actual, totales anterior, 25 búsquedas principales y 10 páginas principales, ordenadas por clics como devuelve Google.
- FR-006 Cada intento se guarda, con éxito o fallo, en `search_console_snapshots`, con propiedad, periodos, cifras, filas y motivo de fallo.
- FR-007 Motivos de fallo tipados: `invalid_credentials`, `api_disabled`, `no_access`, `quota_exceeded`, `error`. `no_access` incluye cuántas propiedades ve la cuenta y su email. `api_disabled` separa «API no activada en el proyecto» de «sin permiso en la propiedad», porque los dos llegan como HTTP 403 y se arreglan en sitios distintos.
- FR-008 El cambio frente al periodo anterior solo se muestra si el periodo anterior tiene impresiones. Clics e impresiones en porcentaje; posición en diferencia absoluta, y bajar es mejorar.
- FR-009 La interfaz avisa de que la suma de búsquedas puede ser menor que el total, porque Google omite búsquedas poco frecuentes.

## Non-functional requirements

- Sin dependencias nuevas.
- Cada llamada con tiempo máximo de 15 s; un intento son como mucho 6 llamadas.
- La clave privada y el token nunca se guardan, se registran en logs ni aparecen en mensajes.
- Respuestas de Google validadas con Zod; textos recortados (búsqueda 200, página 500 caracteres); cifras negativas o no finitas se rechazan.
- Búsquedas y URLs se pintan como texto, nunca como enlace ni HTML (B08b).

## API / Interface changes

- Server Action `refreshSearchConsoleAction(workspaceId)`.
- Variable de entorno opcional `GSC_SERVICE_ACCOUNT_JSON`.

## Data model changes

Tabla `search_console_snapshots`, migración `0006`. Una fila por intento, borrado en cascada con la empresa.

## Edge cases

- La cuenta ve propiedades, pero ninguna de este dominio: `no_access`.
- Propiedad sin datos en el periodo: éxito con ceros y tablas vacías, mostrado como «Sin búsquedas en este periodo», no como error.
- 401 o `invalid_grant` en el token: `invalid_credentials`. 403 en la consulta: `no_access`. 429: `quota_exceeded`.
- Empresa borrada durante la llamada: no se guarda nada y la acción devuelve «Esta empresa ya no existe».
- Dos clics seguidos: dos filas. Es una API gratuita y de solo lectura; se acepta.

## Acceptance criteria

- AC-001 Sin variable, la pestaña Google muestra «Sin configurar» y no hace ninguna llamada de red.
- AC-002 Con credencial válida y acceso, «Traer datos» guarda una fila `completed` y la pestaña muestra cifras, tablas, propiedad y periodo.
- AC-003 Sin acceso a la propiedad, se guarda `failed/no_access` y se muestra el email de la cuenta que hay que añadir.
- AC-004 La tarjeta del resumen muestra clics e impresiones de 28 días cuando hay datos, y la línea anterior cuando no.
- AC-005 Lint, typecheck, unitarias e integración en verde.

## Test scenarios

- Unitarias: parseo de credencial (crudo, base64, inválido); JWT verificable con la clave pública; selección de propiedad; periodos; mapeo y validación de respuestas; clasificación de errores HTTP; resumen y cambios.
- Integración: guardar éxito y fallo contra la rama `test`, lectura del último resultado y cascada al borrar la empresa.

## Source of Truth Matrix

| Dato | Fuente | Verificado |
|---|---|---|
| Search Analytics: endpoint, cuerpo, `dataState`, fechas en hora del Pacífico, `rowLimit` | developers.google.com/webmaster-tools/v1/searchanalytics/query | 2026-10-27 |
| Token de cuenta de servicio por JWT | developers.google.com/identity/protocols/oauth2/service-account | 2026-10-27 |
| Cuota 1.200 consultas/min por sitio | doc 08 §3 | UNVERIFIED |

## Assumptions

- Olessium tiene su propiedad verificada en Search Console. Si no, el conector devuelve `no_access` hasta que se verifique.
- La organización de Google Cloud permite crear claves de cuenta de servicio. La política `iam.disableServiceAccountKeyCreation` lo impide.

## Open questions

- Para clientes externos (Fase 5), OAuth del propietario sustituirá o convivirá con la cuenta de servicio.
