# Decisions: Conector de Google Analytics 4

### D001 - Cuenta de servicio, no OAuth

**Date:** 2026-10-28 · **Status:** Accepted

**Context:** GA4 admite OAuth de usuario y cuentas de servicio. El operador ya usa una cuenta de servicio para Search Console, y la plataforma aún no tiene autenticación (D-03).

**Decision:** La cuenta de servicio, añadida como lectora en cada propiedad de GA4 que se quiera leer. OAuth por cliente queda para la Fase 5 (BL-03).

**Consequences:** Cada cliente tiene que añadir el email de la cuenta de servicio en su propiedad. No se guardan tokens de usuario.

### D002 - La misma credencial que Search Console

**Date:** 2026-10-28 · **Status:** Accepted

**Context:** Una variable nueva duplicaría un secreto que ya existe, y el operador tendría que mantener dos claves.

**Decision:** GA4 lee `GSC_SERVICE_ACCOUNT_JSON` con `parseServiceAccount`. No hay variable nueva.

**Consequences:** El nombre de la variable se queda corto (habla de Search Console). Revocar la clave corta ambas integraciones. Para cortar solo GA4, se quita a la cuenta de servicio de la propiedad.

### D003 - Propiedad por dominio, sin guardarla en la empresa

**Date:** 2026-10-28 · **Status:** Accepted

**Context:** El id de propiedad de GA4 no sale del dominio. Guardarlo en la empresa pediría un campo y un formulario nuevos.

**Decision:** Se busca entre las propiedades que ve la cuenta de servicio la que tiene un flujo web con el host de la empresa (FR-004). Prioridad: host guardado, dominio, `www.`; empate, el id más bajo. Tope de 20 propiedades revisadas.

**Reasoning:** Es el mismo modelo que Search Console y Bing: cero configuración por empresa.

**Consequences:** Hasta 21 llamadas de Admin en el peor caso (resúmenes y 20 listas de flujos). Si un día hace falta elegir a mano, se añade el campo en otra spec.

### D004 - Alcance como parámetro del token de Search Console

**Date:** 2026-10-28 · **Status:** Accepted

**Context:** `signJwt` fija el alcance `webmasters.readonly`. GA4 necesita `analytics.readonly`.

**Decision:** `signJwt` y `fetchAccessToken` aceptan el alcance, con el de Search Console por defecto. Es un cambio adyacente necesario en un módulo de otra feature, sin cambiar su comportamiento.

**Reasoning:** Copiar la firma JWT duplicaría código delicado. Un módulo compartido de Google sería una refactorización más grande que la que pide la feature.

**Consequences:** `fetchAccessToken` lanza `GscError`; la recogida de GA4 lo traduce a sus motivos. AC-010 protege a Search Console. También se exporta `isServiceDisabled` de `google.ts`, sin cambiarla, para clasificar los 403 de GA4 igual que los de Search Console.

### D005 - Periodos con fechas explícitas, terminando 2 días antes

**Date:** 2026-10-28 · **Status:** Accepted

**Context:** GA4 procesa los datos con retraso, normalmente en menos de 48 h, y las fechas relativas (`NdaysAgo`) se resuelven en la zona horaria de la propiedad, que no se conoce antes de la llamada.

**Decision:** 28 días que terminan 2 días antes de la fecha UTC de la captura, y los 28 anteriores, con fechas `YYYY-MM-DD` explícitas.

**Reasoning:** Con fechas explícitas, las que se guardan y se muestran son las que se pidieron. Dos días de margen evitan cifras incompletas al final del periodo.

**Consequences:** Los periodos de GA4 no coinciden con los de Search Console (3 días) ni con los de Bing (último día con datos). La interfaz muestra las fechas de cada uno.

### D006 - Sin CONSTITUTION ni SERVICES

**Date:** 2026-10-28 · **Status:** Accepted

**Context:** El proyecto no tiene `specs/CONSTITUTION.md` ni `specs/SERVICES.md`; `/sdd` pide `/project-init` en ese caso.

**Decision:** Se siguen las convenciones de 001–005, como en ellas.

**Consequences:** Ninguna nueva.

### D007 - Comportamiento de Bing para la configuración

**Date:** 2026-10-28 · **Status:** Accepted

**Context:** Search Console guarda un fallo `invalid_credentials` cuando la credencial no se puede leer. Bing no llama a nada, oculta el botón y muestra los datos guardados con un aviso (D009 de la 005).

**Decision:** GA4 sigue a Bing: sin credencial usable no hay botón, llamada ni fila.

**Consequences:** Search Console y GA4 se comportan distinto ante la misma credencial rota. Se acepta; unificarlos sería tocar Search Console fuera de alcance.

### D008 - Archivos compartidos con la 004

**Date:** 2026-10-28 · **Status:** Accepted

**Context:** La 004 sigue sin commitear en `es.ts`, `en.ts`, `messages.test.ts` y `seo/page.tsx`.

**Decision:** Se trabaja en la misma copia y al commitear se construye un árbol con `HEAD` más solo la 006, como en la 005, y se comprueba en un worktree desechable antes de commitear.

**Consequences:** La suite se repite sobre el árbol separado.

### D009 - El 403 de API desactivada, confirmado con la cuenta real

**Date:** 2026-10-28 · **Status:** Accepted

**Context:** La spec dejaba sin verificar la forma real de los 403 de las APIs de GA4. Una recogida de prueba con la cuenta de servicio real, sin guardar nada, devolvió `admin_api_disabled`: el proyecto `olessium` no tiene activada la Admin API.

**Decision:** Se mantiene la clasificación compartida con Search Console (`isServiceDisabled`).

**Consequences:** T009 queda bloqueada hasta que el operador active la Google Analytics Admin API y la Data API y añada la cuenta de servicio como Lector en la propiedad.


### D010 - `dateRange` no se pide como dimensión

**Date:** 2026-10-29 · **Status:** Accepted

**Context:** Con la propiedad real (`properties/561384888`, creada el 2026-10-29 en la cuenta «Olessium» con el flujo web de olessium.com y la cuenta de servicio como Lector), los informes de totales y de canales devolvían 400: «Field dateRange is not a dimension». Los dobles de las pruebas aceptaban la petición, así que no se vio antes.

**Decision:** `runReport` quita `dateRange` de las dimensiones que envía. Con varios periodos GA4 añade esa columna por su cuenta (comprobado con la API real), y la respuesta se sigue exigiendo con ella.

**Consequences:** Cambia una línea de `ga4.ts` y la aserción del cuerpo en `ga4.test.ts`. La recogida real ya termina en `ok` (con ceros: la web aún no lleva la etiqueta `G-KF9XKPT07W`).
