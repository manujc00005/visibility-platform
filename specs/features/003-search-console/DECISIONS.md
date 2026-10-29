# Decisions: Conector de Google Search Console

## Decision log

### D001 - Cuenta de servicio, no OAuth del propietario

- **Decisión:** una única cuenta de servicio de la plataforma que el propietario añade como usuario en su propiedad.
- **Motivo:** el piloto lo usa el operador sobre webs propias o de clientes con acceso. Evita pantalla de consentimiento, verificación de scopes por Google y guardar tokens cifrados.
- **Alternativa descartada:** OAuth con `integrations` cifrada (doc 05). Llega cuando haya clientes que se autoconecten (Fase 5).
- **Coste de revertir:** bajo. El adaptador recibe un proveedor de token; OAuth sería otro proveedor.

### D002 - JWT firmado con `node:crypto`, sin `googleapis`

- **Decisión:** firmar el JWT RS256 y llamar a la API REST con `fetch`.
- **Motivo:** son dos endpoints y un formato de JWT documentado. `googleapis` añade una dependencia muy grande para eso.
- **Alternativa descartada:** `google-auth-library`. Recomendada por Google, pero la regla del proyecto es una dependencia solo cuando hace falta.

### D003 - Propiedad resuelta por dominio con prioridad fija

- **Decisión:** elegir la propiedad entre las accesibles, con la propiedad de dominio primero.
- **Motivo:** la propiedad de dominio cubre protocolos y subdominios; elegir a mano añade un formulario sin necesidad hoy.
- **Coste de revertir:** bajo; se añadiría un campo opcional en la empresa.

### D004 - Una fila por intento con cifras y filas en JSON

- **Decisión:** `search_console_snapshots` guarda totales y tablas en `jsonb`.
- **Motivo:** se leen siempre juntos y nunca se filtran por búsqueda. Una tabla de filas diarias llegará con la monitorización (Fase 6).

### D005 - Periodo de 28 días que acaba 3 días antes

- **Decisión:** fechas fijas calculadas en la captura con `dataState = final`.
- **Motivo:** los datos finales tardan unos días; así el periodo es estable y comparable. Es el periodo por defecto de la interfaz de Search Console.

### D006 - T009 cerrada con datos reales a cero; la comparación con cifras, pendiente

- **Fecha:** 2026-10-29.
- **Contexto:** la cuenta de servicio real ya existe (la usa también GA4, spec 006) y tiene acceso a `sc-domain:olessium.com`. La propiedad es reciente: Search Console solo tiene días desde el 26 oct y ninguno con impresiones, así que la API y la interfaz coinciden en cero.
- **Decisión:** T009 se da por hecha: AC-002 se cumple con una captura real `completed` que coincide con Search Console, aunque sea a cero. Comparar cifras distintas de cero y ver tablas con filas queda como seguimiento en TASKS, como en Bing (005, D011) y GA4 (006, D011).
- **Coste de revertir:** ninguno; si con datos aparece una diferencia, se corrige en una iteración aparte.

### D007 - Hallazgos de las revisiones de cierre que se dejan para una iteración

- **Fecha:** 2026-10-29.
- **Contexto:** `/spec-review`, `/qa-review` y `/review-all` (seguridad, base de datos, acción, backend y frontend) sobre el código actual, con los cambios posteriores de i18n (003-i18n, D019) y del scope (006). No hay hallazgos críticos ni altos en el código. Funcional y probado en lo que pide la spec, pero las conectoras posteriores (Bing y GA4) añadieron cosas que aquí faltan.
- **Decisión:** se cierra la spec y se dejan como seguimiento, porque cambian el comportamiento descrito y necesitan enmendar la spec:
  - Sin estado vacío: con los dos periodos a cero, la vista dice «Conectado», muestra ceros, «Sin datos del periodo anterior» en cada cifra y la nota de privacidad de la tabla, sin explicar que una propiedad reciente aún no tiene impresiones. Es lo que pide la spec (Edge cases: «éxito con ceros»). GA4 ya tiene ese estado.
  - Sin aviso de configuración: si se quita la credencial con datos guardados, sigue diciendo «Conectado»; si queda mal formada, el botón sigue y el fallo se explica como clave rechazada por Google.
  - El periodo se calcula con el día UTC, y Search Console cuenta días del Pacífico: entre las 00:00 y las 08:00 UTC el último día puede no ser final todavía.
  - El texto de la tarjeta del resumen sigue diciendo «falta conectar» si hay credencial pero ninguna captura buena.
  - Pruebas que faltan: render de la sección, fila guardada sin token, redacción del logger para `GSC_SERVICE_ACCOUNT_JSON` en rutas anidadas, cuerpo y método de la consulta en los dobles.
  - Seguridad, bajo: no se comprueba que la clave sea RSA; la propiedad se elige por dominio con una cuenta compartida (exige vincularla a mano antes de tener varios usuarios, Fase 5); las búsquedas guardadas pueden llevar datos personales y no hay purga (M07 del roadmap); un `siteEntry` mal formado falla toda la lista.
- **Coste de revertir:** ninguno; son añadidos. La primera iteración natural es el estado vacío y el aviso de configuración, copiando lo de GA4.
