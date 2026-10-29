# Decisions: Conversiones desde la búsqueda orgánica en GA4

## Decision log

### D001 - Eventos clave, no tasas

**Date:** 2026-10-29

**Status:** Accepted

**Context:** GA4 ofrece recuentos (`keyEvents`) y tasas (`sessionKeyEventRate`, `userKeyEventRate`). El cliente de la 006 exige métricas enteras (su FR-010).

**Decision:** solo recuentos de eventos clave. Ninguna tasa, ni de GA4 ni calculada por la app.

**Reasoning:** los recuentos caben en el cliente sin relajar su validación, y una tasa propia mezclaría informes con denominadores distintos.

**Consequences:** el bloque dice cuántos eventos clave hubo, no qué proporción de sesiones convirtió.

### D002 - Lista de eventos clave desde la Admin API

**Date:** 2026-10-29

**Status:** Accepted

**Context:** con la Data API sola, «no hay eventos clave configurados» y «no hubo ninguno en el periodo» dan el mismo cero.

**Decision:** `properties.keyEvents.list`, una página de 200, en paralelo con los informes.

**Reasoning:** el operador necesita saber si tiene que marcar eventos en GA4 o si simplemente no hubo conversiones.

**Consequences:** una llamada más por captura. La lista es la configuración en el momento de capturar, no la del periodo.

### D003 - Orgánico es el canal `Organic Search` exacto

**Date:** 2026-10-29

**Status:** Accepted

**Context:** el grupo de canales predeterminado de GA4 agrupa todos los buscadores en `Organic Search`.

**Decision:** se compara y se filtra con el valor exacto, `caseSensitive: true`, sin sumar otros canales ni traducir.

**Reasoning:** es el valor que documenta GA4 para el grupo de canales predeterminado. Una lista de equivalencias sería una suposición sin datos. *Corrección tras las revisiones (D009):* no se ha visto en una respuesta con filas; la 006 cerró sin visitas. Queda como seguimiento.

**Consequences:** si una propiedad devolviera otro nombre, orgánico saldría a cero; la sección lo advierte cuando hay total positivo y orgánico cero.

### D004 - Columna nueva `key_events`

**Date:** 2026-10-29

**Status:** Accepted

**Context:** se podría ampliar `channels` con los eventos clave de cada canal.

**Decision:** columna `key_events jsonb` aparte, nula en capturas anteriores y en fallos.

**Reasoning:** las filas antiguas conservan su forma y «captura sin esta feature» queda explícito como nulo.

**Consequences:** migración `0011` con su `check` en modo `strict`, como la 007 (su D008).

### D005 - El bloque y su tabla van dentro de la tarjeta

**Date:** 2026-10-29

**Status:** Accepted

**Context:** pregunta abierta de la SPEC: la tabla por evento dentro de la tarjeta o junto a las de canales y páginas.

**Decision:** el bloque «Conversiones desde buscadores» va dentro de la tarjeta, bajo las tres cifras, con su tabla de como mucho diez eventos dentro del bloque.

**Reasoning:** las tablas de canales y páginas solo se pintan con visitas (`state = ok`), y el bloque debe verse también en «Sin visitas» (FR-009). Dentro de la tarjeta no depende de esa condición.

**Consequences:** la tabla es pequeña y usa el mismo contenedor con `overflow-x-auto` que las demás.

### D006 - El aviso de calidad también en «Sin visitas»

**Date:** 2026-10-29

**Status:** Accepted

**Context:** hoy el resumen devuelve pronto en `state = empty` sin avisos de calidad, y la sección solo pinta el aviso con visitas.

**Decision:** en `empty` el resumen conserva `quality` y `keyEvents`, y la sección pinta el aviso de calidad cuando hay bloque de eventos clave.

**Reasoning:** FR-008 y AC-003 piden que un umbral o un muestreo en los informes nuevos se vea aunque no haya visitas.

**Consequences:** cambia un retorno temprano de `summarizeAnalytics`; las pruebas de la 006 sobre `empty` deben seguir pasando.

### D007 - Sumas exactas con tope de 10¹²

**Date:** 2026-10-29

**Status:** Accepted

**Context:** cada métrica ya llega validada como entero de 0 a 10¹². Sumar hasta 100 filas puede pasar de ese tope.

**Decision:** si la suma de un periodo pasa de 10¹², la captura falla con `error`. Por debajo de 2⁵³ la suma de enteros es exacta.

**Reasoning:** guardar un número que la propia app considera imposible para una métrica sería incoherente con la 006.

**Consequences:** caso imposible en la práctica; queda probado y cubierto.

### D008 - T008: lo que respondió GA4 de verdad y dos correcciones de la sección

**Date:** 2026-10-29

**Status:** Accepted

**Context:** la captura real de olessium.com (`properties/561384888`, fila `completed` del 2026-10-29 a las 17:03 UTC en `dev`) guardó `key_events`:
- **Configurados:** `close_convert_lead`, `qualify_lead` y `purchase`.
- **Recuentos:** los cuatro a cero y desglose vacío, porque la web aún no tiene visitas (D011 de la 006).

GA4 respondió 200 a la lista y a los dos informes nuevos. La Data API valida dimensiones y métricas aunque no haya datos: ya devolvió 400 a una dimensión inválida en una propiedad vacía (D010 de la 006). Así que las combinaciones `keyEvents` con `sessionDefaultChannelGroup` y con `eventName` más el filtro quedan comprobadas. El valor literal `Organic Search` no se pudo ver, porque no hay filas.

La revisión visual a 375 px encontró dos fallos:
- **Nota bajo las cifras:** decía «Sin visitas en el periodo anterior», la frase de las cifras de visitas.
- **Tabla del desglose:** con un nombre de evento largo y sin espacios, desbordaba su contenedor y escondía la columna del recuento tras un scroll interno.

**Decision:** se corrigen los dos:
- **Nota:** clave propia `keyEvents.noPreviousValue` («Sin eventos clave en el periodo anterior»).
- **Tabla:** la celda del evento parte en cualquier punto (`break-all`) y la cabecera del recuento no se rompe. Con una fila sintética que luego se borró, el ancho de scroll de la tabla es igual al visible (299 px) y el de la página igual a 375, en `es` y en `en`.

Además, la nota sobre los límites de la tabla no se muestra cuando todo está a cero, porque no hay tabla que explicar.

**Consequences:** la comparación de cifras con los informes de GA4 queda como seguimiento hasta que haya visitas y eventos, como en la 006.

### D009 - Resultado de las revisiones de cierre

**Date:** 2026-10-29

**Status:** Accepted

**Context:** T009 se hizo con tres revisiones independientes:
- **Seguridad:** sin hallazgos críticos, altos ni medios; uno bajo y cuatro informativos.
- **Dominio (base de datos, API interna y frontend):** sin críticos ni altos; un medio, el tipo real de `keyEvents`.
- **Conformidad:** «conforme con observaciones», con cinco medios de evidencia y una contradicción de la SPEC.

La consulta de solo lectura a `GET /v1beta/properties/561384888/metadata` confirmó el riesgo del medio: GA4 declara `keyEvents` como `TYPE_FLOAT`. `sessions`, `activeUsers`, `screenPageViews` y `eventCount` son `TYPE_INTEGER`, igual que las métricas por evento (`keyEvents:<evento>`). Con la regla de enteros de la 006, un valor «2.5» habría hecho fallar toda la captura de GA4, visitas incluidas.

**Decision:** se corrige:
- **Datos:**
  - Solo `keyEvents` acepta decimales no negativos (`^\d{1,13}(\.\d{1,12})?$`, como mucho 10¹²); las demás métricas siguen enteras y con el mismo mensaje.
  - El resumen enseña los decimales con un decimal y los enteros como enteros.
  - La base ya aceptaba cualquier número.
- **Recursos y robustez:**
  - Una señal de cancelación compartida por captura: si una de las seis llamadas paralelas falla, las otras se cancelan en lugar de agotar sus 15 s y gastar cuota (SEC-008-L1).
  - Tipo literal `"Organic Search"` en el filtro.
  - Topes de Zod en la lista de eventos clave: 200 entradas y nombres de 1000 caracteres.
  - Recorte de nombres por punto de código y sin NUL, para que Postgres no rechace el `jsonb`.
- **Sección:**
  - Nota propia bajo cada cifra cuando no hay periodo anterior.
  - «En total (suma de canales)» como etiqueta visible a cualquier ancho.
  - Sin frase de parte orgánica si el total actual es cero.
  - Nota de límites partida en total y tabla, cada una solo cuando aplica.
  - Texto de «sin recuento orgánico» que habla del nombre exacto de canal.
  - Lista de configurados como `ul`/`li`.
  - Tabla anidada sin sombra y con título pequeño.
  - Frase de «sin eventos clave» que nombra el botón y la ruta «Administrar › Visualización de datos › Eventos clave».
- **Pruebas:**
  - Tiempo agotado de las llamadas nuevas y cancelación compartida.
  - JSON inválido y topes de la lista.
  - Decimales aceptados y valores inválidos rechazados.
  - Cuerpos literales de la 006, informe de 100 filas y desglose que no llega a lo orgánico.
  - Seis formas más rechazadas por el `check`.
  - Último éxito visible tras un fallo de una llamada nueva.
  - Regresiones del estado vacío de la 006.
- **Documentos:**
  - SPEC: el `check` usa un predicado `strict` más un `CASE`, que compara cuántos elementos del desglose están bien formados con cuántos hay. En modo `strict`, un elemento sin `event` solo excluye su propio filtro.
  - PLAN: el rollback incluye quitar los dos `check` del esquema.
  - D003: el literal `Organic Search` no se ha visto todavía.

Se acepta sin cambio:
- `break-all` en la tabla (DOM-014): cumple a 375 px y evita depender de una utilidad nueva de Tailwind.
- La «fila previa» de AC-009 se simula con nulo tras migrar (DOM-005, CONF-11). La equivalencia la da que la columna no tiene valor por defecto, y la confirma la fila real de `dev`.
- El error de consola de T008 (CONF-12): el registro del servidor lo sitúa en el hueco D-22, antes de aplicar la `0011`.
- El recorte de `pagePath` de la 006 por unidades UTF-16 (SEC-008-I1): es de otra feature y se menciona, no se cambia.
- Datos personales en nombres de evento mal configurados y la falta de retención de `analytics_snapshots` (SEC-008-I4): son anteriores y quedan para la fase de privacidad.
- La ruta de la interfaz de GA4 en el texto: la documenta Google, pero no se ha comprobado en la interfaz real.
- `UNVERIFIED`: el formato real de un `keyEvents` distinto de cero y el literal `Organic Search` solo se verán con visitas.

**Consequences:** el tipo `KeyEvents` guarda números que pueden tener decimales. El seguimiento de TASKS añade el literal del canal y el formato real de `keyEvents`.
