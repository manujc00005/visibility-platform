# Decisions: Sugerencia de competidores

## Decision log

Revisión 2026-10-26: D001–D007 se conservan como historial. Las decisiones vigentes son D008–D014; SPEC, PLAN y TASKS ya incorporan sus contratos.

### D001 - Fuente inicial: captura asistida con ChatGPT

**Date:** 2026-10-26

**Status:** Superseded — sustituida por D008. Registro histórico; no implementar este mecanismo.

**Context:** No existe una fuente gratuita que devuelva competidores fiables por sí sola. Google Places y DataForSEO son de pago y el criterio del owner hoy es empezar por lo gratuito.

**Decision:** El operador hace la pregunta propuesta en ChatGPT y pega la respuesta con sus fuentes. La app extrae y puntúa. Google Places y DataForSEO quedan como implementaciones futuras de la misma interfaz `CompetitorSource`.

**Reasoning:** Reutiliza el flujo de captura asistida ya verificado, no requiere cuentas ni claves y es comprobable con pruebas de texto fijo.

**Consequences:** La precisión depende de la pregunta y de que ChatGPT cite webs; por eso la pregunta se propone, se guarda y se muestra, y el estado vacío explica la causa.

### D002 - Tablas propias, separadas de las mediciones GEO

**Date:** 2026-10-26

**Status:** Superseded — sustituida por D009. Registro histórico; no implementar este mecanismo.

**Context:** La captura para descubrir competidores se parece a una observación GEO, pero su pregunta es de comparación o de sector y no debe contar en capture, answers ni cuota de voz.

**Decision:** Tres tablas nuevas: extracciones, sugerencias y descartes. Ninguna fila en `geo_runs`, `geo_observations` ni `provider_spend`.

**Reasoning:** Mantiene las métricas de visibilidad limpias (M03) y permite reemplazar sugerencias sin perder descartes.

**Consequences:** Una migración más (`0005`) y un servicio propio. Rollback con tres `DROP TABLE`.

### D003 - No se guarda la respuesta íntegra

**Date:** 2026-10-26

**Status:** Superseded — sustituida por D010. Registro histórico; no implementar este mecanismo.

**Context:** La respuesta de ChatGPT es contenido de terceros; la retención de `response_text` ya es deuda (M07, D-20).

**Decision:** Guardar solo el hash SHA-256 del texto, las fuentes citadas y un fragmento de 200 caracteres por candidato.

**Reasoning:** Basta para detectar repeticiones y para mostrar la procedencia; evita acumular más texto de terceros.

**Consequences:** No se puede reextraer con reglas nuevas a partir de una extracción antigua; el operador vuelve a pegar.

### D004 - Extracción por reglas, sin modelo de lenguaje

**Date:** 2026-10-26

**Status:** Superseded — sustituida por D011. Registro histórico; no implementar este mecanismo.

**Context:** Extraer nombres de un texto libre es ambiguo; un modelo de lenguaje lo haría mejor, pero añadiría proveedor, coste y resultados no reproducibles.

**Decision:** Reglas versionadas: fuentes citadas, elementos de lista y negritas, fusión nombre-dominio por nombre normalizado, lista de genéricos.

**Reasoning:** Reproducible, probado con texto fijo y suficiente para el formato habitual de ChatGPT. Si falla, el estado vacío lo dice y el operador pide a ChatGPT que incluya las webs.

**Consequences:** Formatos inusuales darán menos candidatos; las reglas se pueden ampliar subiendo `SUGGESTION_RULES_VERSION`.

### D005 - «Mismo sector» por dos vías, obligatorio

**Date:** 2026-10-26

**Status:** Superseded — sustituida por D012. Registro histórico; no implementar este mecanismo.

**Context:** La portada de un competidor no siempre nombra el sector con las mismas palabras que la ficha; la pregunta registrada sí lleva el sector.

**Decision:** El factor se cumple si la pregunta guardada contiene el sector de la ficha o si la portada contiene el sector o alguno de los servicios. Es obligatorio por una de las dos vías.

**Reasoning:** Evita descartar competidores reales por diferencias de vocabulario sin dejar pasar respuestas a preguntas ajenas al sector.

**Consequences:** Si el operador pega una respuesta a otra pregunta, solo la vía por portada filtra; la pregunta se muestra para que se note.

### D006 - Lectura de portadas con el fetcher seguro y presupuesto propio

**Date:** 2026-10-26

**Status:** Superseded — sustituida por D013. Registro histórico; no implementar este mecanismo.

**Context:** Comprobar que un candidato tiene web propia implica leer webs ajenas, con riesgo SSRF y de carga (B08a).

**Decision:** `fetchPageHead` usa `createSafeFetcher` con límites de 256 KB y 5 s por candidato, máximo 5 en paralelo y 25 peticiones por extracción; no sigue enlaces ni lee sitemaps.

**Reasoning:** Mismas garantías que la auditoría con un coste acotado.

**Consequences:** Portadas lentas o pesadas quedan como «web no comprobada» con puntuación menor, sin bloquear la extracción.

### D007 - Descartes en tabla propia, por dominio o nombre normalizado

**Date:** 2026-10-26

**Status:** Superseded — sustituida por D014. Registro histórico; no implementar este mecanismo.

**Context:** Una extracción nueva reemplaza las sugerencias anteriores; el descarte debe sobrevivir a ese reemplazo.

**Decision:** Tabla `geo_competitor_dismissals` con clave (`workspace_id`, dominio normalizado o, sin dominio, nombre normalizado).

**Reasoning:** Un índice parcial sobre la fila de sugerencia no bastaría cuando la fila pasa a `superseded`.

**Consequences:** Un descarte es definitivo; para recuperar un competidor descartado, el operador lo añade a mano.

### D008 - Captura asistida con revisión humana y sin adaptadores futuros

**Date:** 2026-10-26

**Status:** Accepted

**Supersedes:** D001.

**Decision:** Mantener ChatGPT mediante pegado del operador, sin automatización ni API. No introducir `CompetitorSource` para proveedores hipotéticos. Permitir corregir nombre/web y exigir confirmación manual; procedencia declarada y fecha de captura de la app, no cita o fecha de generación verificadas.

**Reasoning:** La selección comercial necesita criterio humano y una segunda fuente todavía no existe.

**Consequences:** Se conserva la captura asistida de D001, pero no se garantiza precisión, disponibilidad ni acceso gratuito ilimitado a la cuenta externa. Google Places/DataForSEO necesitan otra spec.

### D009 - Persistencia separada y aceptación transaccional

**Date:** 2026-10-26

**Status:** Accepted

**Supersedes:** D002.

**Decision:** Conservar tres tablas propias sin mediciones ni gasto GEO. Añadir constraints por empresa, claves únicas y decisión manual guardada. Alta manual/aceptación comparten transacción con bloqueo de empresa antes de validar identidad/límite e insertar; aceptar bloquea después sugerencia y enlaza competidor atómicamente. Descartar sigue el mismo orden. Reintentos idempotentes y publicación de extracción con control de contexto/base; sin red dentro de transacciones.

**Reasoning:** Contar y después insertar por separado no garantiza cinco competidores ni evita dobles aceptaciones.

**Consequences:** Es necesario ajustar mínimamente el servicio compartido y probar carreras con conexiones independientes. Migración aditiva antes del código; rollback operativo conserva las tablas y los competidores. D002 conserva validez en separación de métricas; sus DROP TABLE no son el procedimiento de recuperación.

### D010 - Minimización, contexto congelado y huella de entrada completa

**Date:** 2026-10-26

**Status:** Accepted

**Supersedes:** D003.

**Decision:** No guardar respuesta completa ni HTML. Guardar hash, fuentes, fragmentos acotados, contexto congelado, evidencias y versión. Huella única por empresa sobre pregunta, hash, fuentes canónicas, contexto y reglas; misma entrada devuelve existente, cambios permiten nueva extracción con el mismo texto.

**Reasoning:** El hash solo de la respuesta impide corregir fuentes y aplicar nuevas reglas. Las decisiones deben seguir siendo explicables al cambiar la ficha.

**Consequences:** Se conserva la minimización de D003, pero los fragmentos siguen siendo retención de contenido ajeno y no permiten reconstruir la respuesta. Retención provisional mientras exista empresa; M07 debe resolver política definitiva antes de apertura a clientes. No crear job adicional ahora ni registrar contenido en logs.

### D011 - Extracción, enriquecimiento y asociación separados

**Date:** 2026-10-26

**Status:** Accepted

**Supersedes:** D004.

**Decision:** `assistedCaptureSource.extract` obtiene nombres y referencias sin red. Tras consultar portadas, `associateCandidates` usa vínculos explícitos o coincidencia única del nombre en título; ambigüedades quedan sin web. Usar hostname normalizado, nunca llamarlo dominio registrable; fronteras de punto para hosts conocidos y exclusiones tras redirects. No inferir titularidad de una URL citada o un 2xx.

**Reasoning:** Un extractor puro no puede depender de títulos descargados después; una referencia puede ser un artículo o agregador.

**Consequences:** Se mantienen reglas deterministas sin LLM de D004. Marcas cortas no se eliminan por longitud. No se agrupan dominios hermanos desconocidos ni se añade cálculo heurístico de sufijos públicos. El operador resuelve dudas o usa alta manual.

### D012 - Indicios explícitos y orden simple, sin score de confianza

**Date:** 2026-10-26

**Status:** Accepted

**Supersedes:** D005.

**Decision:** Pregunta = contexto, nunca prueba. Factores `matched`/`unknown`/`conflicting` con evidencia del candidato; `matched` es un indicio. Accesibilidad web separada de titularidad. Orden por número de coincidencias de sector/zona/servicios, accesibilidad, nombre y hostname. Sin score 0–100 ni pesos ocultos. No inferir incompatibilidad geográfica por una dirección distinta; reconocer solo las dos formas textuales de exclusividad acotadas en SPEC, sin atribuir exclusividad a una lista JSON-LD.

**Reasoning:** Incluir el sector o ciudad en la pregunta concede coincidencias a todos los candidatos y no prueba relevancia.

**Consequences:** Se muestran desconocidos con advertencia y revisión obligatoria; incompatibilidades explícitas se excluyen. AC-001 debe probar candidatos ajenos aunque la pregunta sea correcta. Se abandona completamente la vía de acreditación por pregunta de D005.

### D013 - Presupuesto externo acotado incluyendo DNS y cancelación

**Date:** 2026-10-26

**Status:** Accepted

**Supersedes:** D006.

**Decision:** 20 hostnames, concurrencia 5, 25 intentos incluidos redirects, 256 KiB descomprimidos y 5 s acumulados por candidato. Deadline externo 15 s incluyendo DNS; cancelar conexiones e impedir conexiones tardías después de resolver. Reservar 256 KiB por intento da un tope conservador de 6.400 KiB para 25 intentos. Solo extracción hace red; HTTPS sin fallback y sin crawl. Resultado parcial con aviso al agotar plazo; fallo global conserva anterior.

**Reasoning:** Cuatro tandas de cinco segundos no dejan margen para devolver en menos de veinte; timeout por salto sin DNS no limita un candidato.

**Consequences:** Se conserva el fetcher seguro de D006, reforzando su contrato y probando su implementación real con dependencias instrumentadas. No simular el bloqueo SSRF como única evidencia. Presupuesto monetario agotado no bloquea esta fuente sin coste de API.

### D014 - Descartes por identidades prefijadas y decisiones duraderas

**Date:** 2026-10-26

**Status:** Accepted

**Supersedes:** D007.

**Decision:** Claves `host:` y `name:` por empresa; guardar ambas si están disponibles. Revalidar descartes antes de publicar extracción, impedir que repetición o carrera resuciten decisiones y no sustituir estados aceptados/descartados con `superseded`.

**Reasoning:** Un candidato descartado sin web no debe reaparecer al añadir un dominio, y los namespaces deben ser inequívocos.

**Consequences:** Se conserva tabla propia y descarte duradero de D007. Añadir manualmente permite recuperar el negocio, sin eliminar el descarte de descubrimiento. Una aceptación ya completada devuelve su competidor en reintentos; aceptar y descartar no pueden ganar a la vez.
