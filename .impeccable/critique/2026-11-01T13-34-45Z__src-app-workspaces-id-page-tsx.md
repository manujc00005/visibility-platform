---
target: /workspaces/[id]
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 1
p1_count: 2
target_identity: "file:/Users/manu/Proyectos/visibility-platform/src/app/workspaces/[id]/page.tsx"
target_fingerprint: "sha256:909735da615f7e32c96ecb23de0f0fbe4c00c74a502430a7af2695c5055d174f"
target_path: /Users/manu/Proyectos/visibility-platform/src/app/workspaces/[id]/page.tsx
timestamp: 2026-11-01T13-34-45Z
slug: src-app-workspaces-id-page-tsx
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score

| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Estados de medición excelentes; pero «Parcial» en ámbar en IA confunde medición incompleta con problema |
| 2 | Match System / Real World | 2 | Jerga para el propietario (críticos/importantes, robots.txt, sitemap, TLS, Chrome UX Report, Captura asistida) |
| 3 | User Control and Freedom | 3 | Página de lectura con pestañas y migas claras; «Ejecutar auditoría» como botón principal ante el propietario |
| 4 | Consistency and Standards | 2 | Bueno/Bien, Regular/Mejorable, Malo/Mal en la misma pantalla; «Parcial» gris en rendimiento y ámbar en IA; aviso parcial sobre fondo Iris |
| 5 | Error Prevention | 3 | Sin puntuación compuesta, cero con denominador, «Sin comparación»; «Principal problema» bajo un «Bueno» |
| 6 | Recognition Rather Than Recall | 3 | Cada tarjeta se explica; la nota de IA obliga a cuadrar «1 de 1» con «3 preguntas medidas» |
| 7 | Flexibility and Efficiency | 2 | Nada para el operador: ni resumen de intentos, ni acceso directo a lo antiguo |
| 8 | Aesthetic and Minimalist Design | 2 | 5–7 bloques de texto por tarjeta; dos cifras Display en la tarjeta de Google |
| 9 | Error Recovery | 3 | Los vacíos nombran el siguiente paso, pero en voz de operador |
| 10 | Help and Documentation | 2 | Explica qué mide, nunca «¿esto es malo para mi negocio?» |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict
LLM: parcialmente específico. La composición (tres tarjetas iguales + lista) es la plantilla genérica de dashboard; lo propio es el sistema de honestidad (fuente y fecha, denominadores, «Sin comparación»). El North Star «El parte del técnico» se cumple en tono, no en estructura: un parte abre con el veredicto y la acción.
Deterministic: CLI 1 hallazgo (side-tab, status-ui.tsx:61, MetricTile) — falso positivo para esta ruta (MetricTile no se renderiza aquí). Overlay: straggler (Olessium), unbalanced-heading (h1 de demo), overused-font (Geist 98 %, decisión de DESIGN.md). Contraste de texto apagado 5,67–6,27:1, todo AA. 13 de 16 objetivos táctiles < 44 px a 375 px.

## Priority Issues
- [P0] «Visibilidad en Google: Bien» junto a «sin impresiones en los últimos 28 días» (Olessium). El veredicto solo refleja la auditoría técnica de la portada (page.tsx:137) y la tarjeta promete visibilidad. Fix: renombrar a lo que mide o que Search Console califique el veredicto. /impeccable clarify
- [P1] La acción llega la última; no hay veredicto de cabecera. Fix: franja de una frase bajo la cabecera con lo más urgente y ancla a la oportunidad #1. /impeccable layout
- [P1] Escala de veredictos inconsistente (es.ts:171,172,317,1083) y «Parcial» con dos tonos (page.tsx:77 vs :178); aviso parcial sobre Iris (opportunities.tsx:57). Fix: una escala Bien/Mejorable/Mal; la completitud como aviso, no como tono. /impeccable polish
- [P2] Las salvedades pesan más que el dato dentro de las tarjetas. Fix: una salvedad por tarjeta en el hueco de avisos; el resto al detalle. /impeccable distill
- [P2] Controles y textos de operador en la vista del propietario («Ejecutar auditoría», «Ejecuta la primera auditoría», «Ver informe» sin informe). Fix: franja de operador discreta y vacíos escritos para el propietario. /impeccable clarify

## Persona Red Flags
Alex: sin resumen de intentos ni acceso a lo antiguo; tres pestañas para saber qué está desactualizado.
Sam: aria-describedby lee el párrafo entero pero omite la pastilla de estado, fuente y avisos; «Ver el detalle» repetido sin nombre distinto.
Propietario de clínica: ve «Mal (parcial)» en rojo y jerga; la frase clara (HTTPS no funciona) está bajo el pliegue; «Ejecutar auditoría» parece suyo; sin camino a un servicio.

## Minor Observations
Títulos de tarjeta que se parten por la pastilla; prioridad alta con el icono de «Mal»; pies de fuente de 3 líneas; marca DEMOSTRACIÓN dentro del nombre; cifra Display grande con n=1; objetivos < 44 px en móvil.

## Questions to Consider
Si el propietario lee una sola frase, ¿cuál es, y por qué no la escribe la página? ¿Puede la tarjeta «Visibilidad en Google» llenarse honestamente hoy? ¿Deberían ser la misma página la vista del propietario y la del operador?
