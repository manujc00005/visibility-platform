---
target: /workspaces/[id]
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 2
target_identity: "file:/Users/manu/Proyectos/visibility-platform/src/app/workspaces/[id]/page.tsx"
target_fingerprint: "sha256:c4f8be7b4bc92188fd47d8904fad7e5b3f0292aa534e26bb106773b8f2495474"
target_path: /Users/manu/Proyectos/visibility-platform/src/app/workspaces/[id]/page.tsx
timestamp: 2026-11-02T15-46-59Z
slug: src-app-workspaces-id-page-tsx
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | Estados excelentes; la pastilla «Medido» de Search Console no dice nada |
| 2 | Match System / Real World | 2 | Títulos en voz de propietario, contenido con jerga (robots.txt, SSL, TLS, sitemap.xml: 404) |
| 3 | User Control and Freedom | 3 | Informe de lectura con migas y pestañas |
| 4 | Consistency and Standards | 2 | IA sin medir dicho de tres maneras; dos cifras Display en Search Console |
| 5 | Error Prevention | 3 | «0 críticos» como cero suelto en Display |
| 6 | Recognition Rather Than Recall | 3 | Línea de situación y oportunidades separadas |
| 7 | Flexibility and Efficiency | 2 | Nada para el operador; texto repetido en cada oportunidad |
| 8 | Aesthetic and Minimalist Design | 2 | Lo pendiente aparece en la línea, la lista y el aviso parcial |
| 9 | Error Recovery | 3 | «La última revisión no pudo medirla» sin qué pasa después |
| 10 | Help and Documentation | 2 | Sin referencia de «bueno» en Search Console ni IA |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict
Mayormente específico en las palabras (preguntas, fuente y fecha, parcial honesto, «Quién puede hacerlo»); la capa visual sigue siendo shadcn genérica.
Detector: CLI side-tab status-ui.tsx:61 (no renderizado). Overlay: overused-font en las tres; straggler en el vacío de la demo. Contraste 5,62–6,27:1. Sin desbordamiento a 375 px. Objetivos < 44 px: los previos más «Definirlo»/«Editar» del objetivo. Descripciones de tarjeta concatenan bloques sin separador en el texto bruto.

## Priority Issues
- [P1] La señal más fuerte no produce acción: Olessium «Google aún no te muestra» y la página cierra con «no hemos encontrado acciones prioritarias»; buildOpportunities no lee Search Console (por D002 en la pastilla, pero no hay regla que impida una oportunidad). /impeccable shape
- [P1] Estado y acción separados; la primera acción queda baja (en móvil ~1.400 px en García); el aviso parcial repite la lista de pendientes. /impeccable layout + distill
- [P2] La línea del objetivo comercial es voz de operador («Definirlo», «evento», «recepción»). /impeccable clarify
- [P2] La tarjeta de Search Console rompe la cifra única y su pastilla «Medido» no informa. /impeccable polish
- [P2] Jerga en la capa del propietario (tarjeta técnica parcial, evidencias con URLs y 404). /impeccable clarify

## Persona Red Flags
Alex: sin última/próxima ejecución por fuente ni enlace de una fila pendiente a su sitio.
Sam: «Ver qué hacer» sin contexto en lista de enlaces; «-17 %» con guion; «Ver el detalle» duplicado.
Propietario: tres de cuatro preguntas sin responder y sin fecha; «parcial» sin explicar; sin «qué pasa ahora».

## Minor Observations
Cero suelto en Display; tarjeta única a 1.226 px con mucho vacío; notas en xs; marca de demo en el h1; «Quién puede hacerlo» repetido en cada oportunidad.

## Questions to Consider
¿Sobra la línea de situación si la oportunidad #1 ocupara su sitio? ¿Search Console, sin veredicto, también sin acción? ¿Por qué no hay fecha de la próxima medición?
