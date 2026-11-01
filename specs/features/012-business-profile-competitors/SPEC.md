# Feature Spec: Perfil de negocio y detección asistida de competidores

## Status

Done (2026-11-01). Los 18 criterios cubiertos; AC-018 verificado con la respuesta real de ChatGPT para Olessium.

## Problem

Comparar con competidores no sirve si la empresa no tiene competidores reales. Olessium solo tiene «Competidor Ejemplo» (`competidor-ejemplo.es`), una fila de prueba del 2026-10-26 cuyo dominio da NXDOMAIN. La comparativa de la 011 funciona: mide lo que hay en `geo_competitors`.

Olessium tiene 0 extracciones. La captura asistida de la 001 existe, pero está en otra página y pregunta solo por sector y lugar. La aplicación no sabe qué vende la empresa, a quién, si la zona importa ni qué tipos de competidor interesan. Además, la ficha puede quedarse corta: Olessium figura como «Agencia de automatización y CRM» con 3 servicios y su web presenta estrategia, marketing, automatización e IA.

## Goal

El operador confirma un perfil de negocio propuesto desde la portada de su web. Con él obtiene una pregunta completa para ChatGPT, pega la respuesta y revisa candidatos con su tipo y motivo. Los que confirma entran en la comparativa, y esta enseña su tipo.

## Non-goals

- API de pago, LLM propio o búsqueda automática. El responsable eligió el 2026-10-31 la vía gratuita; la API de Claude con búsqueda web queda en el backlog (BL-08).
- Automatizar ChatGPT (D008 de la 001) o usar scraping de buscadores.
- Garantizar que un candidato es competidor: la confirmación sigue siendo del operador.
- Leer páginas interiores de la web propia o de los candidatos.
- Editar sector o servicios de la ficha desde el perfil.
- Cambiar métricas, capturas o columnas de la comparativa de la 011.
- Cambiar la medición en IA o la cuota de voz. Un competidor con tipo se comporta igual que uno sin tipo en esas funciones.

## Users / Actors

- Operador: confirma el perfil, usa ChatGPT, pega la respuesta y decide. Sigue siendo el único usuario (D-03).
- ChatGPT: fuente externa declarada, sin integración.

## Current behavior

- `workspaces` guarda sector, país, ciudad opcional y servicios.
- `/geo/setup` ofrece dos preguntas cortas y un formulario de captura limitado a 500 caracteres de pregunta.
- `assistedCaptureSource.extract` lee listas, negritas y URLs. Al copiar el texto ya formateado de ChatGPT se pierden negritas y viñetas.
- `evaluateCandidate` compara sector, servicios y lugar con título y descripción. El lugar se trata igual tanto si importa como si no.
- `geo_competitors` no distingue tipos.
- La comparativa solo enlaza a gestionar competidores cuando no hay ninguno elegible.

## Desired behavior

1. En «Competidores» de `/geo/setup` aparece «Perfil de negocio». «Proponer desde mi web» lee la portada propia y rellena el formulario sin guardar nada. Cada propuesta deducida explica en qué se basa.
2. El operador corrige y guarda. Nada se usa en la detección hasta que lo guarda.
3. Con perfil guardado, la pregunta corta se sustituye por una pregunta completa para copiar, que incluye negocio, oferta, cliente objetivo, regla de zona, tipos pedidos y formato de respuesta.
4. Al pegar la respuesta, las líneas con el formato pedido dan nombre, web, tipo, zona declarada y motivo. Las respuestas libres se siguen interpretando como hasta ahora.
5. Las tarjetas muestran el tipo declarado, editable, y omiten el factor de zona cuando no aplica.
6. Al confirmar, el competidor guarda su tipo. La comparativa lo muestra en su fila y mantiene visible el enlace para detectar o gestionar competidores.

## Functional requirements

- FR-001 Perfil: una fila por empresa con resumen del negocio, oferta, tipo de cliente (`b2b`, `b2c`, `both`), cliente objetivo, relevancia de zona (`local`, `regional`, `national`, `international`), zona atendida y tipos buscados (`direct`, `indirect`, `substitute`).
- FR-002 Validación: resumen 1–400 caracteres; oferta 0–10 líneas de hasta 80; cliente objetivo 1–200; zona atendida hasta 120, obligatoria en `local` y `regional`; al menos un tipo. Mensajes en `es` y `en`. El guardado es idempotente y toma el bloqueo de empresa.
- FR-003 Propuesta: acción explícita que usa el dominio guardado en el servidor, lee solo la portada propia con el fetcher seguro y no escribe en base de datos. Cargar la página no usa red.
- FR-004 Reglas de propuesta, deterministas y sin LLM:
  - Resumen: meta description; si falta, primer H1; si falta, vacío.
  - Oferta: hasta 10 encabezados H2/H3 de 3 a 60 caracteres que no sean frases ni eslóganes (sin `.`, `?`, `!`, `→`, `>`, `|`), sin duplicados. Si no hay, los servicios de la ficha.
  - Cliente: términos completos en título, descripción y encabezados. `b2b`: pymes, empresas, negocios, tu negocio, tu empresa, startups, equipos, profesionales, B2B. `b2c`: particulares, familias, pacientes, consumidores, tienda online. Ambos grupos o ninguno dan `both`, con el motivo a la vista.
  - Cliente objetivo: los términos encontrados; si no hay, vacío y el operador debe escribirlo.
  - Zona: tipo JSON-LD de una lista fija en `profile.ts` (`LocalBusiness`, `Dentist`, `Store`, `Restaurant` y similares) o ciudad en la ficha dan `local`; dos o más `hreflang` de idiomas distintos dan `international`; si no, `national`. Zona atendida: ciudad de la ficha o primera localidad del JSON-LD.
  - Tipos: `direct` e `indirect`.
- FR-005 Fallo de lectura: web inaccesible o bloqueada conserva lo escrito en el formulario y explica el motivo. Una redirección a otro dominio registrado no se sigue. El perfil se puede escribir a mano.
- FR-006 Pregunta completa: `discoveryPrompt` es puro, en español como las preguntas de mercado actuales, y cabe en 2.000 caracteres recortando primero la oferta. Los textos del perfil se aplanan: sin saltos, acentos graves ni `|`. Pide hasta 5 empresas reales con web propia, verificadas en búsqueda web, y excluye a la propia empresa, directorios, marketplaces, artículos y comparadores. Define los tipos pedidos. El formato de línea es `COMPETIDOR | Nombre | https://web | tipo | zona donde atiende | motivo`, dentro de un bloque de código.
- FR-007 Regla de zona en la pregunta: `local` y `regional` exigen atender en la zona; `national` pide cobertura en el país, sin importar la ciudad; `international` indica que la ubicación no importa y que cuenta el mercado al que venden.
- FR-008 Línea estructurada: `extract` reconoce la línea sin distinguir mayúsculas, incluso dentro de un bloque de código o con enlace markdown en la URL. Da nombre, URL explícita, tipo normalizado (`directo`/`direct`, `indirecto`/`indirect`, `sustituto`/`substitute`), y fragmento `motivo · Atiende: zona` de hasta 200 caracteres. Sin web se indica con la columna vacía o `sin web`. Tipo desconocido es `null`. El mínimo es prefijo, nombre y columna web; con menos, la línea no es estructurada y sigue el flujo libre. Solo la columna web crea una referencia, y las URL del motivo no. El nombre pasa las mismas guardas que el flujo libre. La línea de plantilla con «Nombre» o «https://web» se ignora.
- FR-009 Evaluación con perfil: los servicios se comparan con ficha más oferta del perfil. La zona usa zona atendida en `local`/`regional`, dividida por comas, `/` e «y», y país en `national`. La exclusividad solo excluye en `local`/`regional`, y si no coincide ninguno de esos lugares; en `national` queda `unknown`. En `international`, el factor pasa a `not_applicable`, no pide revisión ni excluye. Sin perfil, todo funciona como en la 001.
- FR-010 Tipos: un candidato con tipo declarado fuera de los buscados se excluye con aviso. Un candidato sin tipo se muestra con «Tipo sin indicar». El orden es directo, indirecto, sustituto, sin tipo; después FR-003b de la 001.
- FR-011 Contexto congelado: `context_snapshot` incluye los campos del perfil, sin fechas y con tipos ordenados, releídos bajo el bloqueo al publicar. Lo ya guardado sin perfil se sigue leyendo. Editar el perfil durante la red provoca `conflict`, igual que editar la ficha.
- FR-012 Aceptación: la tarjeta permite elegir tipo o dejarlo sin indicar, validado por enumeración. El valor se guarda en `geo_competitors.kind`. Alta manual: sin tipo, sin cambio de formulario.
- FR-013 Comparativa: cada competidor muestra su tipo actual bajo el nombre, si lo tiene. Se cruza por `competitorId` y no entra en la captura guardada. La sección enseña siempre el enlace a detectar o gestionar competidores. El texto de `no_competitors` lleva a detectarlos. Si un competidor medido está `unreachable`, se añade un aviso para revisarlo.
- FR-014 Limpieza: «Competidor Ejemplo» de Olessium se archiva en `dev` (reversible). No se borra y no se añade ninguna lista de nombres de prueba al código.
- FR-015 Textos nuevos en `es` y `en`, salvo la pregunta y los avisos guardados, que siguen en español (límites de la 001).

## Non-functional requirements

- Performance: la propuesta hace una lectura de portada, con 3 MB y 10 s como máximo. Sin consultas nuevas por candidato.
- Security: `workspaceId` validado; el dominio sale del servidor; toda lectura pasa por el fetcher seguro. El texto de la web y de la respuesta se muestra como texto. La propuesta no guarda HTML. El perfil lo escribe el operador y queda dentro del perímetro D-03 y BL-07. No se registran resumen, cliente, pregunta ni respuesta en logs.
- Observability: registrar empresa, duración y resultado de la propuesta, sin contenido.
- Maintainability: reutilizar `extractPage`, `jsonLdLocalities`, el formulario de captura, `acceptSuggestion` y `compareEvaluated`. Sin capa de proveedores (D008 de la 001). La tabla vive en `geo/competitors`.

## API / Interface changes

- `proposeBusinessProfileAction(workspaceId, previous)` y `saveBusinessProfileAction(workspaceId, previous, formData)`, en `geo/actions.ts`.
- `GeoFormState` añade `notes?: string[]`.
- `acceptSuggestionAction` acepta `kind`.
- `MAX_QUESTION` pasa de 500 a 2.000, y el campo de pregunta pasa a área de texto.
- Nuevo componente de formulario de perfil en `components/geo`.
- `ComparisonRow` y `ComparisonSection` reciben el tipo.

## Data model changes

- Nueva tabla `geo_business_profiles`, con `workspace_id` como PK y FK en cascada, los campos de FR-001, `created_at` y `updated_at`. CHECK de enumeraciones, longitudes, cardinalidad y subconjunto de tipos, y zona obligatoria en `local`/`regional`.
- `geo_competitors.kind` y `geo_competitor_suggestions.competitor_kind`: texto nullable con CHECK.
- `geo_competitor_extractions_question_length` pasa a 1–2.000.
- Migración aditiva, sin backfill. Olessium se limpia con la acción de archivar, no en la migración.

## Edge cases

- Web propia inaccesible o HTML sin descripción: formulario editable y motivo visible.
- Propuesta sobre un formulario con cambios sin guardar: los sustituye solo el clic explícito del operador.
- Portada con encabezados publicitarios: entran como propuesta y el operador los borra.
- Respuesta con solo líneas estructuradas sin web: candidato sin web, con revisión manual.
- Línea con URL de un directorio: excluida por FR-003 de la 001.
- Respuesta con citas `utm_source`: el host se normaliza igual.
- Candidato igual a un competidor ya registrado o descartado: reglas de la 001.
- Perfil borrado con la empresa: cascada.
- Extracción guardada antes de esta feature: se muestra sin perfil ni tipo.
- Estado `not_applicable` en filas nuevas leído por la interfaz, sin romper filas antiguas.
- Competidor archivado: no aparece en la comparativa (FR-010 de la 011).
- Tipo de competidor en `<script>`: imposible por enumeración, y el nombre sigue como texto.
- Vista a 375 px con la pregunta larga: sin scroll horizontal de página.

## Acceptance criteria

- AC-001 Guardar un perfil válido crea una fila; guardar de nuevo la actualiza; cada violación de FR-002 da error de campo en `es` y `en` y no escribe.
- AC-002 Cargar `/geo/setup` no hace red. Proponer hace una lectura de portada y no crea ni cambia filas.
- AC-003 Con fixtures se cubre cada regla de FR-004: B2B, B2C, ambos, ninguno; local, internacional, nacional; sin descripción; sin encabezados. Cada propuesta deducida lleva su motivo.
- AC-004 Web inaccesible o destino privado: mensaje claro, cero conexiones al destino rechazado y formulario manual utilizable.
- AC-005 `discoveryPrompt` produce en las cuatro relevancias su regla de zona, solo los tipos pedidos, y nunca pasa de 2.000 caracteres con oferta y resumen máximos.
- AC-006 `extract` obtiene nombre, web, tipo, zona y motivo de líneas estructuradas dentro y fuera de bloque de código, con enlace markdown, en `es` y `en`, y sigue dando los resultados de la 001 para respuestas libres.
- AC-007 Con `international`, una web que declara «solo atendemos en Barcelona» no se excluye por zona y no recibe nota de zona. Con `local` en Madrid, se excluye. Sin perfil, el resultado es el de la 001.
- AC-008 Con tipos `direct` e `indirect`, un `sustituto` queda fuera con aviso y el orden es el de FR-010, recalculado igual desde filas guardadas.
- AC-009 Cambiar el perfil cambia la huella y permite extraer de nuevo. Editarlo durante la red devuelve `conflict` y conserva la extracción anterior.
- AC-010 Aceptar con tipo corregido guarda ese `kind`, y la comparativa lo muestra en la fila. Un competidor sin tipo no muestra etiqueta.
- AC-011 La sección de comparativa muestra el enlace en todos los estados con botón y sin competidores, y el aviso con un competidor `unreachable`, en `es` y `en`.
- AC-012 La migración rechaza cada forma inválida con su restricción nombrada, borra en cascada y conserva filas anteriores. Extracciones antiguas se leen y se muestran.
- AC-013 A 375 px y 1280 px en `es` y `en`, la pregunta y el formulario no causan scroll horizontal. HTML hostil en proposición y respuesta se ve como texto.
- AC-014 Comprobación real con olessium.com: la propuesta se genera desde su portada real y se revisa contra lo que dice la web.
- AC-015 Prueba del recorrido en navegador sobre empresa temporal, con una respuesta construida con competidores reales encontrados en búsqueda web: candidatos, aceptación y comparativa con cifras reales. La empresa temporal se borra después.
- AC-016 «Competidor Ejemplo» queda `archived` en `dev` y la página SEO de Olessium pide detectar competidores.
- AC-017 Lint, typecheck, unitarias, integración y build en verde.
- AC-018 Evidencia del operador: una respuesta real de ChatGPT para Olessium pegada en la aplicación, con competidores revisados y comparados. Depende del operador (D008 de la 001) y no se simula.

## Test scenarios

- Unit: validación, propuesta, pregunta, extracción estructurada, evaluación, orden, render en `es` y `en`, catálogos.
- Integration: guardado, cascada, restricciones, conflicto por perfil, aceptación con tipo, regresión de la 001 y la 011.
- E2E: no hay suite; se cubre en navegador.
- Manual: AC-013 a AC-016.

## Assumptions

- Spec 012 amplía la 001 sin sustituir sus decisiones; su exclusión de APIs de pago y LLM se mantiene.
- Quien pega usa ChatGPT con búsqueda; la respuesta se trata como dato no fiable.
- Las reglas de FR-004 son orientativas y por eso nada se guarda sin confirmación.
- Pregunta y términos de cliente en español: el mercado de los pilotos es España, y las demás lenguas quedan fuera.
- Migrar `dev` es necesario y seguro por ser aditivo. `production` no se toca.
- El nombre visible de los tipos: directo, indirecto, sustituto.

## Open questions

- AC-018 dependía de una acción del operador: Resolved el 2026-11-01.
- Las señales de sector y servicios exigían la frase literal, así que con frases largas salían «sin indicios» aunque la web hablara de lo mismo: Resolved el 2026-11-01 (D011).

## Contracted services

Contracted services not declared → all billable add-ons treated as NOT contracted (conservative default). Run `/project-init` to declare them. Esta feature no añade servicios de pago.
