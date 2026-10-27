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
