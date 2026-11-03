---
target: /workspaces/[id]
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/manu/Proyectos/visibility-platform/src/app/workspaces/[id]/page.tsx"
target_fingerprint: "sha256:bc5e041bdde8d00fb295421dd7cd2ba2a149b876e5cd7a8c6b81ac868228b382"
target_path: /Users/manu/Proyectos/visibility-platform/src/app/workspaces/[id]/page.tsx
timestamp: 2026-11-01T16-06-37Z
slug: src-app-workspaces-id-page-tsx
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | La pastilla de Google refleja solo Search Console: «Sin datos» por fuera, «Mal (parcial) · 2 críticos» por dentro (García) |
| 2 | Match System / Real World | 2 | Jerga en la vista del propietario: Search Console, PageSpeed Insights, Chrome UX Report, robots.txt, SSL, TLS |
| 3 | User Control and Freedom | 3 | «Ver informe» en tarjeta sin medir lleva a un informe vacío |
| 4 | Consistency and Standards | 2 | Pastilla/cifra/línea con tres palabras para un estado; «Lo que más podría mejorar» frente a «sin acciones prioritarias» (Olessium) |
| 5 | Error Prevention | 3 | «Ejecutar auditoría» es el control más fuerte ante el propietario |
| 6 | Recognition Rather Than Recall | 3 | El aviso de datos parciales queda lejos de las tarjetas que explica |
| 7 | Flexibility and Efficiency | 2 | Sin última ejecución, enlace al PDF ni checklist para el operador |
| 8 | Aesthetic and Minimalist Design | 2 | La tarjeta de Google apila dos veredictos, dos fuentes y ~8 unidades |
| 9 | Error Recovery | 3 | Motivos claros, recuperación en voz de operador |
| 10 | Help and Documentation | 2 | Sin glosario ni «quién lo arregla / te ayudamos» |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict
Contenido específico (fuente y fecha, k de n, parcial neutro, oportunidades con evidencia); carcasa shadcn intercambiable; «El parte del técnico» vive en el texto, no en la composición.
Detector: CLI side-tab status-ui.tsx:61 (no renderizado aquí). Overlay: straggler ×5, unbalanced-heading (demo), overused-font. Contraste 5,62–6,27:1. 15/18 objetivos < 44 px a 375 px; sin desbordamiento. «No medida» se anuncia dos veces; descripción de Google ~330 caracteres; «Presencia en IA» ×2 con destinos distintos.

## Priority Issues
- [P1] La tarjeta de Google esconde su peor veredicto conocido: pastilla solo de Search Console (google.ts:54-61, decisión D002 de la spec 014) y el «Mal (parcial)» técnico queda dentro bajo un gris; 0 impresiones medidas se muestran como neutro. /impeccable shape (decisión de producto)
- [P1] Controles y textos de operador en la vista del propietario. /impeccable distill
- [P1] Jerga y sin camino a ayuda en las oportunidades. /impeccable clarify + shape
- [P2] El titular de estado vacío hereda el interlineado de 36 px (Muted dentro de text-4xl leading-tight; page.tsx:85-91, overview-card.tsx:106). /impeccable typeset
- [P2] Tarjetas sin medir con el mismo peso que las medidas. /impeccable layout

## Persona Red Flags
Alex: sin «última auditoría hace N días», sin checklist ni PDF.
Sam: descripción de Google larga y en orden contradictorio; «No medida» duplicado; CTA fuera del nombre; «Presencia en IA» duplicado con destinos distintos.
Propietario: el botón principal parece suyo; «Posicionamiento pendiente de medir»; «Añade preguntas» le pide trabajo; SSL sin quién ni cuánto.

## Minor Observations
«Editar» casi sin borde sobre el fondo tintado; minutos en los pies; títulos partidos; demo solo marcada en el h1; indicador de dev.

## Questions to Consider
¿Por qué tres baldosas iguales y no una frase veredicto? ¿Página de propietario o de operador? ¿La neutralidad honesta está suavizando malas noticias (0 impresiones, Mal (parcial) en gris)?
