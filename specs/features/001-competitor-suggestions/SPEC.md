# Feature Spec: Sugerencia de competidores

## Status

In Progress

Revisada el 2026-10-26 tras la revisión independiente. Implementación y pruebas ejecutadas ese mismo día (ver TASKS.md); pendientes la verificación manual con captura real y las revisiones de cierre.

## Problem

El operador debe introducir manualmente los competidores de cada empresa. Una captura asistida puede ayudar a descubrir candidatos, pero una respuesta de ChatGPT puede contener empresas irrelevantes, nombres ambiguos y enlaces a artículos en lugar de webs comerciales.

## Goal

Ofrecer hasta 5 candidatos por empresa, con procedencia, indicios y dudas visibles, para que el operador revise y confirme cuáles son competidores reales. Excluir coincidencias conocidas con la propia empresa, directorios, marketplaces y competidores ya registrados o descartados. La herramienta ayuda a seleccionar; no garantiza exhaustividad ni demuestra por sí sola sector, cobertura geográfica o titularidad de una web.

## Non-goals

- Automatizar interfaces de asistentes, añadir APIs de pago o usar un LLM para interpretar el texto.
- Crear mediciones GEO, alterar cuota de voz o añadir sugerencias al PDF.
- Rastrear enlaces, sitemaps o páginas interiores de candidatos.
- Descubrir automáticamente todas las relaciones entre marcas y dominios, ni calcular dominios registrables mediante heurísticas.
- Garantizar que una empresa es competidora por aparecer en una respuesta o por tener una web accesible.
- Añadir autenticación de clientes o extender el perímetro actual de la aplicación, reservado al operador.

## Users / Actors

- Operador: pregunta en ChatGPT, pega respuesta y fuentes, revisa y confirma candidatos.
- ChatGPT: fuente declarada por el operador, sin integración automática ni coste de API para la aplicación. Su acceso y sus límites pertenecen a la cuenta del operador.
- Webs de terceros: consultadas únicamente con el fetcher seguro existente.

## Current behavior

- `addCompetitor` admite nombre, web opcional y alias; `MAX_ACTIVE_COMPETITORS = 5`.
- La comprobación actual del límite y la inserción son operaciones separadas: reutilizar el servicio sin cambios no evita altas concurrentes que excedan el límite.
- `normalizeWebsite` devuelve el hostname normalizado sin `www.`, no el dominio registrable. Conserva otros subdominios.
- `suggestPrompts` contiene preguntas de sector y comparaciones con competidores existentes; la pregunta de alternativas a la propia marca debe añadirse como plantilla de descubrimiento, sin modificar las salidas existentes.
- El fetcher valida DNS y fija la IP; el timeout actual por petición no cubre la espera previa de DNS y se reinicia por salto. Este contrato debe reforzarse para cumplir los límites de esta feature.

## Desired behavior

1. Mostrar preguntas copiables: «¿Qué {sector} me recomiendas en {ciudad o país}?» y «¿Qué alternativas hay a {marca} en {zona}?». La pregunta es contexto, nunca evidencia del candidato.
2. Pegar pregunta usada, respuesta y URLs citadas. «Extraer competidores» inicia el procesamiento; cargar o recargar la página solo lee datos guardados.
3. Extraer nombres y URLs sin red; consultar portadas de los dominios admitidos; asociar nombres con dominios cuando exista una coincidencia inequívoca; evaluar indicios y exclusiones.
4. Mostrar hasta 5 tarjetas con nombre editable, web opcional editable, fuentes, fragmento, estado de comprobación y motivos. Una asociación ambigua no se rellena automáticamente.
5. El operador revisa y confirma cada candidato. La ausencia de evidencias se muestra y exige confirmación expresa. Añadir crea el competidor y enlaza la sugerencia en una única transacción.
6. Descartar conserva la exclusión para esa empresa. Una extracción posterior puede sustituir las sugerencias pendientes, sin alterar decisiones previas ni mediciones GEO.

## Functional requirements

- FR-001: `assistedCaptureSource.extract({ answerText, sources })` es puro y devuelve nombres extraídos, URLs y vínculos explícitos encontrados en el texto. No obtiene títulos ni hace asociaciones que requieran datos de red. No se necesita una interfaz de proveedores futuros hasta que exista una segunda implementación.
- FR-001b: Listas numeradas, viñetas y negritas aportan nombres de hasta 120 caracteres. Se elimina la explicación tras «:» o «–», los encabezados genéricos y los duplicados normalizados. Una URL sola aporta una referencia, no una empresa confirmada. No descartar marcas cortas reales solo por tener menos de tres letras. Si no hay nombres, las referencias pueden producir tarjetas con nombre provisional derivado del título y la etiqueta «Nombre pendiente de revisar».
- FR-002: `evaluateCandidates` produce factores con estado `matched`, `unknown` o `conflicting`, motivo y evidencia de origen. La pregunta y el país de la ficha no confirman los factores. `matched` significa coincidencia detectada, no verificación independiente:
  - Sector y servicios: coincidencia de términos completos normalizados del sector o de los servicios en título y descripción; guardar los términos y fragmentos coincidentes. Ausencia de coincidencia significa `unknown`, no incompatibilidad demostrada.
  - Zona: una coincidencia en título, descripción o `PostalAddress`/`areaServed` de JSON-LD aporta un indicio. Otra dirección postal por sí sola no demuestra que no preste servicio en la zona. Solo una declaración explícita de exclusividad en título o descripción constituye `conflicting`: en esta versión se reconocen las formas «solo atendemos en {localidad}» y «exclusivamente en {localidad}», con localidad distinta de la solicitada tras normalización. El resto queda `unknown`; no inferir exclusividad de una lista JSON-LD de localidades. Sin evidencia suficiente, `unknown`.
  - Idioma: dato informativo de la página si existe, sin deducir un idioma único del país ni excluir automáticamente webs multilingües.
  - Web: `reachable`, `unreachable`, `unverified` o `blocked`; un 2xx solo prueba accesibilidad. Nunca mostrar «Web propia verificada» por ese motivo.
- FR-003: Excluir directorios/redes/marketplaces conocidos por lista versionada, propia empresa por nombre y alias normalizados o hostname conocido, competidores activos o archivados y descartes. Coincidencias inequívocamente contradictorias de zona se excluyen. Lo desconocido puede mostrarse con advertencia. No se promete identificar directorios ajenos a la lista solo leyendo una portada.
- FR-003b: No usar puntuación 0–100 ni porcentajes de confianza. Ordenar por número descendente de factores `matched` entre sector, zona y servicios, después web `reachable`, nombre normalizado y hostname en orden lexicográfico. Máximo 5; no completar artificialmente hasta cinco ni recalcular tarjetas al aceptar una.
- FR-004: La aceptación reutiliza la validación del alta manual, permite corregir nombre y web y requiere `reviewConfirmed=true`. Para factores desconocidos o asociación ambigua, mostrar explícitamente qué debe revisar el operador. Los cambios son una decisión manual y no heredan las evidencias del dominio anterior. No se consulta red al aceptar; la web corregida recibe estado «aportada por operador, no comprobada».
- FR-004b: Alta manual y aceptación comparten una operación transaccional que bloquea la fila de la empresa antes de comprobar identidad y límite e insertar. Aceptar bloquea después la sugerencia, comprueba empresa y estado `suggested`, crea el competidor y cambia a `accepted` con su ID en la misma transacción. Repetir una aceptación devuelve el competidor enlazado sin insertar. Las correcciones no pueden introducir la propia empresa ni un directorio conocido; comprobar nuevamente esas exclusiones sobre nombre y hostname corregidos. Un candidato con hostname o nombre normalizado ya registrado, también archivado, devuelve `already_exists`; no se restaura automáticamente. El resto de escritores de competidores debe respetar el mismo bloqueo y validación para evitar carreras.
- FR-005: Descartar escribe una clave prefijada `host:` o `name:` en `geo_competitor_dismissals` y cambia el estado en una transacción. Se guarda también la clave de nombre cuando exista, de modo que un descarte sin web no reaparezca al encontrar después una URL. Un descarte es por empresa; añadir manualmente sigue permitido, aunque no elimina el descarte. Aceptar y descartar simultáneamente no pueden surtir efecto ambos.
- FR-006: Guardar pregunta, fuentes, fecha de captura en la aplicación, versión de reglas, contexto congelado de empresa y evidencias observadas. La procedencia se presenta como «Respuesta de ChatGPT aportada por el operador · capturada el …», sin atribuirle una fecha de generación ni garantizar que las URLs fueran citas verificadas. No prometer reconstruir el texto original desde fragmentos y hash.
- FR-007: Sin nuevas credenciales ni variables de entorno; se mantiene la configuración de base de datos y perímetro existentes. El estado vacío explica si faltan nombres, hay exclusiones o no se pudieron comprobar webs. No ofrecer resultados inventados.
- FR-008: No escribir en `provider_spend`, `geo_runs` ni `geo_observations`. El presupuesto de proveedores de pago no bloquea esta captura asistida. Costes y contratos de futuras APIs requieren otra spec.
- FR-009: Un competidor aceptado se comporta como uno manual para `suggestPrompts`.
- FR-010: Deduplicación idempotente mediante `input_fingerprint`: SHA-256 de una serialización estable de empresa, pregunta recortada, hash de respuesta, fuentes canónicas ordenadas y deduplicadas, contexto congelado y versión de reglas. Para fuentes, usar la serialización WHATWG URL (hostname ASCII en minúsculas y sin fragmento), conservando ruta y query; eliminar duplicados exactos y ordenar lexicográficamente. Serializar contexto y objetos con orden fijo de claves; ordenar las colecciones que sean conjuntos antes de calcular la huella. La respuesta normaliza solo saltos de línea y espacios exteriores antes de calcular su hash. Repetir exactamente la entrada devuelve la extracción existente, sin red ni resucitar descartes; cambiar fuentes, contexto o reglas permite otra extracción.
- FR-010b: Antes de consultar red se lee el ID de la última extracción y el contexto. Al publicar, bloquear la empresa y comprobar que ambos siguen vigentes. Si otra extracción o edición de ficha ganó la carrera, devolver `conflict` sin sustituir resultados. Revalidar descartes y competidores dentro de la transacción. No mantener transacciones ni bloqueos durante consultas externas. Una extracción completada con cero resultados se guarda con su causa y pasa a ser la actual; un fallo global no publica nada y conserva la anterior.
- FR-011: No guardar la respuesta completa ni HTML. Guardar fragmentos de hasta 200 caracteres, título de hasta 120 y descripción de hasta 500, más evidencias acotadas. Estos fragmentos siguen siendo contenido de terceros: no afirmar que el hash elimina la retención. No registrar respuesta, pregunta, URLs completas ni fragmentos en logs.
- FR-012: `discoveryQuestions` comparte la plantilla de sector con `suggestPrompts` y añade la alternativa a la marca propia sin cambiar el comportamiento actual de las preguntas GEO.

## Input, identity and association contract

- Pregunta obligatoria: 1–500 caracteres; respuesta: 1–30.000 caracteres; hasta 20 URLs únicas de fuentes, máximo 2.048 caracteres cada una. Rechazar el exceso antes de cualquier red. Admitir únicamente http(s), sin credenciales ni puertos no estándar, usando validadores existentes.
- Máximo 20 nombres únicos y 20 hostnames a procesar; conservar orden de aparición y avisar si hay más nombres. Filtrar y deduplicar antes de red. No descargar URLs arbitrarias interiores: consultar solo la portada del hostname seleccionado, HTTPS primero, sin fallback automático a HTTP.
- Identidad de web: hostname ASCII normalizado por `normalizeWebsite`, sin `www.`. No llamarlo dominio registrable. Para exclusiones de hosts conocidos, usar igualdad o sufijo con frontera de punto (`host === known || host.endsWith('.' + known)`); `empresa.es.ejemplo.com` no coincide con `empresa.es`. No agrupar dominios hermanos, proveedores de alojamiento compartido ni nombres comerciales desconocidos. Las claves de nombre recortan los espacios de borde del normalizador y colapsan espacios internos; no mezclar sus espacios auxiliares de detección con la identidad persistida.
- La asociación nombre-web es automática solo si el enlace está unido explícitamente al nombre en el elemento de lista, o si existe una única coincidencia de nombre normalizado no genérico en el título. La coincidencia parcial dentro de un hostname no basta. Si hay varios nombres o dominios posibles, dejar la web vacía y conservar las referencias para revisión.
- Los títulos genéricos de una URL sin nombre producen solo una referencia no mostrable, con motivo. El operador puede usar el alta manual existente.
- Conservar URL inicial y final. Tras cada redirección pública, comprobar exclusiones y, antes de asociar, reevaluar el hostname final. No convertir un redirect a la propia empresa o a un directorio conocido en candidato.
- Destino privado o bloqueado: excluir la referencia y su asociación, sin conexión. Un nombre también presente en la respuesta puede quedar sin web y con aviso. Un timeout o fallo DNS deja la web sin comprobar; no acredita propiedad ni relación comercial.

## Non-functional requirements

- Red: concurrencia máxima 5; 25 intentos de petición en total incluyendo redirects; 256 KiB descomprimidos y 5.000 ms por candidato sumando DNS, conexión, cuerpo y redirects. Reservar el límite completo por cada uno de los 25 intentos acota el máximo a 6.400 KiB, sin depender de un contador de bytes concurrente no atómico.
- Deadline global de trabajo externo: 15.000 ms desde el inicio del servicio; al agotarse, cancelar conexiones, impedir nuevos intentos y publicar resultados parciales con advertencia si la aplicación y la DB siguen disponibles. Una resolución DNS que termine tarde no puede iniciar conexiones. No basta con `Promise.race` si la operación continúa conectando después.
- Objetivo de respuesta: menos de 20 s con DB saludable y hasta 20 hostnames. No es una garantía frente a una base de datos indisponible. Pruebas con reloj controlado separan deadline de red y persistencia.
- Seguridad: fetcher real con validación de todas las IPs, IP fijada y validación en cada redirect. Todo texto no fiable se renderiza como texto. Todas las lecturas y mutaciones se acotan por empresa; validar IDs y rechazar combinaciones de empresa/sugerencia ajenas sin revelar la existencia del otro registro.
- Mantener el perímetro actual del operador; disponer de UUIDs no constituye autorización para una futura app multiusuario. Esa apertura requiere revisión de autenticación/autorización aparte.
- Observabilidad: IDs de extracción y empresa, duración, conteos y códigos de error; sin texto aportado ni contenido descargado. Carga de página, aceptación y descarte sin red externa.

## API / Interface changes

- `extractCompetitorsAction(workspaceId, formData)` recibe pregunta, respuesta y fuentes.
- `acceptSuggestionAction(workspaceId, suggestionId, formData)` recibe nombre, web opcional y confirmación de revisión.
- `dismissSuggestionAction(workspaceId, suggestionId)` descarta de forma idempotente.
- `assistedCaptureSource.extract` en `extract.ts`, `associateCandidates` en el mismo módulo tras enriquecimiento, `evaluateCandidates` en `evaluate.ts`, `fetchPageHead(url, fetcher, budget)` en `page-head.ts`.
- `service.ts` orquesta sin red dentro de transacciones. No hay API pública ni rutas nuevas.
- `CompetitorSuggestions` muestra preguntas copiables, formulario, hasta 5 tarjetas, correcciones, evidencias, avisos y decisiones. Reutilizar componentes y validaciones; no forzar una abstracción compartida de formularios si solo coinciden dos campos.

## Data model changes

- `geo_competitor_extractions`: `id`, `workspace_id` FK cascade, `source=assisted`, `question`, `answer_sha256`, `input_fingerprint`, `sources` jsonb, `rules_version`, `context_snapshot` jsonb (marca, aliases, hostname, sector, ciudad, país y servicios), conteos, `warnings` jsonb y `created_at` timestamptz. UNIQUE (`workspace_id`, `input_fingerprint`) y UNIQUE (`workspace_id`, `id`). Última extracción: ordenar por `created_at DESC, id DESC`; al insertar, asignar fecha posterior a la anterior bajo el bloqueo de empresa para que el orden refleje publicación.
- `geo_competitor_suggestions`: `id`, `workspace_id`, `extraction_id`, `candidate_key` (`host:` o `name:`), `name`, `domain` nullable (hostname), `source_urls`, `snippet`, `page_title`, `page_description`, `factors` jsonb, `web_status`, `initial_url`, `final_url`, `checked_at` nullable, `status` (`suggested`, `accepted`, `dismissed`, `superseded`), `competitor_id` nullable, `accepted_input` jsonb nullable (correcciones y confirmación manual), `created_at`, `decided_at`. Sin campo `score`.
- `geo_competitor_dismissals`: PK (`workspace_id`, `identity_key` prefijada), `created_at`; FK empresa cascade.
- FK compuesta de sugerencia (`workspace_id`, `extraction_id`) a extracción para impedir asociaciones entre empresas. `competitor_id` usa FK simple a `geo_competitors.id` con SET NULL. Su pertenencia a la empresa se comprueba en la operación transaccional y se cubre con pruebas de IDs cruzados; no se atribuye esa garantía a la FK simple. La FK compuesta de extracción sí impide referencias cruzadas directamente en DB.
- UNIQUE (`extraction_id`, `candidate_key`); índice (`workspace_id`, `status`). CHECK para estados y para `accepted` con `decided_at` y `accepted_input`; tras borrado de competidor se permite conservar la decisión con `competitor_id` null. Limitar longitudes y validar estructuras JSON al escribir.
- Migración incremental siguiente a las existentes, previsiblemente `0005_competitor_suggestions.sql`; confirmar journal al implementar, sin asumir número fijo de migraciones ni renumerar las aplicadas. `production` fuera de esta ejecución.

## Edge cases

- Sin ciudad: evaluar indicios de país, sin deducirlos de la pregunta, del TLD o del idioma. Sin servicios: factor desconocido, sin penalización oculta.
- Sin web, asociación ambigua o web inaccesible: revisión manual explícita; no afirmar «web propia».
- Cinco activos: botón deshabilitado y validación de servidor; dos altas con cuatro activos solo pueden crear un quinto.
- Repetir aceptación: mismo resultado. Aceptar frente a descartar: una única decisión gana. Sugerencia `superseded`: devolver `stale`, sin crear competidor.
- Descartar repetidamente: éxito sin duplicar claves. Descartar una sugerencia aceptada: `conflict`, no archivar el competidor.
- Dos extracciones o edición de ficha durante la red: la operación perdedora devuelve `conflict`; no reemplaza los resultados más recientes.
- Corregir nombre/web para duplicar un competidor registrado: `already_exists`; no crear otro.
- Una URL bloqueada, un candidato lento o una portada demasiado grande no invalidan los candidatos restantes.

## Acceptance criteria

- AC-001: Fixture de 12 candidatos: 3 directorios conocidos, 1 alias propio, 2 cuya descripción dice «solo atendemos en Barcelona» frente a la ciudad solicitada Madrid y 6 con indicios válidos. Con la pregunta correcta, quedan exactamente 5 ordenados según FR-003b. La pregunta sola nunca convierte un factor desconocido o contradictorio en coincidencia.
- AC-001b: Extracción pura sin llamadas de red; enriquecimiento posterior permite asociación inequívoca. Fixtures cubren listas, negritas, título genérico, marca corta, artículo citado, coincidencia parcial de hostname y asociación ambigua sin URL asignada.
- AC-002: Aceptar con revisión confirmada y correcciones válidas crea un competidor y cambia la sugerencia a `accepted` atómicamente. Una excepción entre ambos pasos revierte todo. Corrección de web no hereda comprobaciones anteriores. El competidor entra en `suggestPrompts` como uno manual.
- AC-003: Descartar y volver a extraer con otras fuentes no resucita el nombre ni hostname descartados. Repetir descarte no duplica claves.
- AC-004: Con cuatro activos y dos altas simultáneas, incluyendo manual y sugerida, solo una tiene éxito. Dos aceptaciones simultáneas de la misma tarjeta crean un competidor. No se crean duplicados por nombre normalizado o hostname ya registrado.
- AC-005: Carga/recarga, aceptación y descarte no hacen red externa. Extracción limita 20 hostnames, concurrencia 5, 25 intentos, 256 KiB por intento y 256 KiB/5 s acumulados por candidato; deadline externo de 15 s incluyendo DNS. Entrada excedida falla sin red. DNS tardío no provoca conexiones posteriores.
- AC-006: Recargar muestra procedencia declarada, contexto congelado, evidencias, fechas y versión sin red. No aparecen porcentajes de confianza ni una etiqueta de titularidad verificada a partir de HTTP 200.
- AC-007: Con fetcher real, resolver y transporte instrumentados: cualquier IP privada, mezcla pública/privada, redirect a destino privado y DNS tardío producen cero conexiones al destino rechazado. Redirects públicos hacia propia empresa/directorio no se muestran como candidatos de esos hosts. No basta simular que el fetcher devuelve rechazo.
- AC-008: No cambian filas ni métricas de `geo_runs`, `geo_observations` y `provider_spend`; presupuesto monetario agotado no impide extracción asistida.
- AC-009: No se guarda respuesta íntegra ni HTML; fragmentos limitados. Logs no contienen una frase marcadora de respuesta, pregunta o fuentes. El hash no se presenta como una garantía de ausencia de contenido de terceros.
- AC-010: Repetición exacta devuelve extracción existente sin red. Cambiar fuentes, contexto o reglas permite extraer de nuevo con la misma respuesta. Dos publicaciones concurrentes y aceptar/descartar durante extracción no resucitan ni sobrescriben decisiones.
- AC-011: IDs de otra empresa, inválidos y sugerencias obsoletas no permiten leer, aceptar ni descartar registros ajenos. Fallo global conserva la extracción anterior; plazo externo agotado produce resultados parciales y aviso; cero candidatos completados correctamente produce estado vacío explicado.
- AC-012: A 375 px no hay desbordamiento horizontal; campos tienen etiquetas, avisos legibles y confirmación de revisión necesaria. HTML hostil se muestra como texto. El botón comunica carga y se evita doble envío desde UI sin depender de ello para la seguridad del servidor.

## Test scenarios

- Unit: extracción, asociación, factores, orden estable, normalización de identidades, exclusiones, límites y plantillas. Tiempo y respuestas externas controlados.
- Integración de fetcher: implementación real con DNS y transporte inyectados, incluidos destinos privados, rebinding, redirects, DNS lento, cancelación y presupuestos concurrentes. Sin consultar IPs privadas reales.
- Integración Neon `test`: transacciones, rollback inducido, carreras con conexiones independientes, IDs cruzados, huella única, decisiones, contexto y aislamiento respecto a métricas GEO. No basta ejecutar peticiones secuenciales para probar concurrencia.
- Manual `dev`: respuesta real para Olessium; revisar la relevancia de los candidatos efectivamente disponibles, corregir uno, aceptar, descartar y recargar; móvil y teclado. Cero a cinco es un resultado válido si la causa es visible.
- Regresión: lint, typecheck, suite completa y build; sin umbral arbitrario de número de tests.
- Revisiones requeridas antes de cierre: spec-review, qa-review, database-review y security-review, sin hallazgos críticos/importantes abiertos.

## Source of Truth Matrix

| Concepto | Fuente de verdad | Documentos derivados |
|---|---|---|
| Reglas, límites, evidencias y aceptación | SPEC | PLAN, TASKS, tests |
| Decisiones y sustituciones | DECISIONS | SPEC, PLAN, TASKS |
| Nombres de módulos y secuencia | PLAN | TASKS, implementación |
| Modelo de datos | SPEC + DECISIONS; esquema al implementar | PLAN, TASKS, migración |
| Despliegue y rollback | PLAN | TASKS |

## Assumptions

- Fuente inicial asistida confirmada por el owner; no se presupone acceso ilimitado ni exactitud de ChatGPT. No se contratan proveedores nuevos.
- La confirmación comercial pertenece al operador, incluso con indicios coincidentes. Competidor comercial y competidor en respuestas IA no siempre son lo mismo; esta feature no los mide.
- No se necesita auditoría previa. No se comparte información entre empresas.
- Retención provisional: extracciones, fragmentos y descartes mientras exista la empresa, borrados con ella. Minimización de texto no resuelve por sí sola M07; no se introduce un job de purga en esta feature.
- No se pretende descubrir aliases ni dominios hermanos desconocidos. El operador puede usar el alta manual si el parser o las exclusiones dejan fuera un negocio válido.

## Open questions

- No bloqueante para el piloto del operador: definir en M07 la retención definitiva y si se necesita purga automática antes de abrir a clientes. La retención provisional está declarada y no equivale a validación legal.
- APIs de descubrimiento y soporte a otros formatos de captura: futuras specs, sin abstracciones ni tareas en esta.

## Contracted services

No se añaden servicios de pago ni se habilitan add-ons. Se utiliza la base de datos configurada y la cuenta de ChatGPT del operador fuera de la aplicación.
