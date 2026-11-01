---
target: /workspaces/[id]
total_score: 25
max_score: 40
na_heuristics: 
p0_count: 0
p1_count: 3
target_identity: "file:/Users/manu/Proyectos/visibility-platform/src/app/workspaces/[id]/page.tsx"
target_fingerprint: "sha256:746e55973aa95134f990853a29bb5df8faaab22e4369ef3f12bd18b65ed00a09"
target_path: /Users/manu/Proyectos/visibility-platform/src/app/workspaces/[id]/page.tsx
timestamp: 2026-11-01T15-03-58Z
slug: src-app-workspaces-id-page-tsx
---
Method: dual-agent (A: design review · B: detector + browser)

## Design Health Score
| # | Heuristic | Score | Key Issue |
|---|---|---|---|
| 1 | Visibility of System Status | 3 | «No medida» con pie «PageSpeed Insights · 25 oct 2026» (page.tsx:98) |
| 2 | Match System / Real World | 2 | Jerga en acciones y fuentes: SSL, sitemap.xml, robots.txt, Chrome UX Report, críticos/importantes sin referencia |
| 3 | User Control and Freedom | 3 | «Ver informe» en tarjeta vacía lleva a un informe vacío |
| 4 | Consistency and Standards | 2 | Pastilla y cifra dicen el estado con palabras distintas (Sin datos/No medida; Sin mediciones/Pendiente de medir); dos cifras Display en Google |
| 5 | Error Prevention | 3 | «Ejecutar auditoría» como acción principal ante el propietario |
| 6 | Recognition Rather Than Recall | 3 | La franja sube la primera acción; «y 1 cosa más» sin nombrarla |
| 7 | Flexibility and Efficiency | 2 | Nada para el operador; «Configurar» manda al propietario a la configuración |
| 8 | Aesthetic and Minimalist Design | 2 | Tarjetas repetitivas (Google en García: seis líneas de «parte mal, parte desconocido») |
| 9 | Error Recovery | 3 | Motivos claros; sin camino para el propietario |
| 10 | Help and Documentation | 2 | Sin referencia de «bueno» para conteos ni muestra IA |
| **Total** | | **25/40** | **Acceptable** |

## Design Specificity Verdict
Parcialmente específico: el contenido supera a la forma. Textos y estados propios del producto; carcasa shadcn intercambiable. Sin frase de situación y sin competidores en la vista.
Detector: CLI side-tab en status-ui.tsx:61 (falso positivo: MetricTile no está en esta ruta). Overlay: straggler (3 páginas), unbalanced-heading (h1 demo), overused-font (Geist). Contraste 5,62–6,27:1, todo AA. 16 de 19 objetivos < 44 px a 375 px; sin desbordamiento. «Lo más importante» sin encabezado propio.

## Priority Issues
- [P1] El veredicto de la tarjeta no llega al lector de pantalla: aria-describedby excluye la pastilla y el pie; «2críticos» sin espacio (overview-card.tsx:86-102, page.tsx:154). /impeccable harden
- [P1] Sin salida a un servicio: las acciones piden al propietario tareas técnicas que no puede hacer; sin «lo hacemos por ti» ni bloque de cierre. /impeccable clarify + /impeccable shape
- [P1] Señales contradictorias entre tarjetas y oportunidades: «Principal problema» bajo «Bien» con lista vacía (Olessium); «2 críticos» frente a una oportunidad (García). /impeccable clarify
- [P2] Controles y estado de operador en la vista del propietario («Ejecutar auditoría», «Configurar», «Solo hay mediciones de demostración o de prueba»). /impeccable distill
- [P2] Estado repetido con palabras distintas y dos cifras Display en Google. /impeccable polish

## Persona Red Flags
Alex: sin visión de estado entre clientes ni «qué cambió»; demo marcada solo en el nombre.
Sam: veredicto y fuente fuera del nombre/descripción; «Ver qué hacer» salta a un h3 no enfocable; «Ver el detalle» duplicado.
Propietario: «No medida» tras pagar; «Configurar» le mete en un formulario de operador; instrucciones técnicas sin camino; sin competidores.

## Minor Observations
Pies a distinta altura; títulos partidos por la pastilla; prioridad baja con icono de bombilla; notas xs abundantes; aviso de dev en móvil.

## Questions to Consider
¿Qué frase debería ocupar la zona del H1? ¿Debe el propietario ver tarjetas «No medida»/«Sin configurar»? ¿Es un informe o una superficie de venta, y dónde está la segunda mitad?
