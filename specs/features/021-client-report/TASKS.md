# Tasks: Informe para el cliente con resultados en buscadores

## Phase 1: Implementation

- [x] T001 - Apartado, resumen, límites, numeración y `fraction`. Covers: AC-001, AC-002, AC-003, AC-004, AC-005, AC-006.
- [x] T002 - Servicio y acción. Covers: AC-001, AC-003.
- [x] T003 - Fuentes embebidas y pie. Covers: AC-006, AC-007.

## Phase 2: Tests

- [x] T004 - PDF de Olessium y de la clínica revisados. Covers: AC-008.
- [x] T005 - PDF en Linux. Covers: AC-009.
- [x] T006 - Suite completa y build. Covers: AC-010.

## Phase 3: Review

- [x] T007 - Revisiones; hallazgos corregidos. Covers: todos los AC (revisión de conformidad y de seguridad).
- [x] T008 - Roadmap (D-15, §8) y cierre. Covers: AC-009 (D-15).

## Evidence

Fecha: 2026-11-01, en `dev`.

- T001 y T002: `build-report.test.ts` cubre cifras con cambio, periodo y fuente; sin impresiones; no medido; objetivo con notas y límite; texto hostil escapado; numeración con y sin IA; «1 de 1» sin porcentaje. `reports.test.ts` comprueba que las cifras salen de la captura guardada, que la frase del objetivo es la del resumen y que un fallo `no_access` no deja el email de la cuenta de servicio en el informe.
- T003: `render-pdf.test.ts` con render real: fuentes Geist y GeistMono dentro del PDF y `blockedRequests` vacío. El CSS solo admite `url(data:font/woff2;base64,…)`.
- T004: informe real generado por la interfaz. El de Olessium antes de esta spec no tenía ninguna cifra de Google y decía «no mide visitas, clics ni posiciones reales». Olessium ahora: «Search Console no registra impresiones… del 30 sept 2026 al 27 oct 2026» y «Solicitud de contacto: pendiente de comprobar la medición»; coincide con su resumen; 3 páginas. Clínica: «Su posicionamiento en Google está pendiente de medir», aviso de error 404 y prioridades; 4 páginas; sin objetivo, no se menciona. Ninguno lleva la medición de prueba de la 013. Revisadas página a página, rasterizadas en un contenedor efímero porque el equipo no tiene `pdftoppm`.
- La rejilla de cifras no se ha visto con datos reales: ninguna empresa de `dev` tiene impresiones. Se revisó con cifras de muestra sobre el HTML real.
- T005 (D-15): el HTML real de Olessium, plantilla `2026-11-01.2`, impreso con pie en `mcr.microsoft.com/playwright:v1.64.1-noble`: 0 peticiones bloqueadas, 3 páginas y el mismo texto que el PDF de macOS. Una primera revisión dio por buena la composición sin pie y sin ampliar la imagen: al ampliarla se vio el texto mal espaciado y un salto de línea distinto, corregidos con `text-rendering: geometricPrecision`. Quedan fuera de la fuente → y ≤, que usan una fuente del sistema: en esa imagen salen bien, pero una imagen de despliegue sin ninguna fuente los dejaría sin glifo.
- Vista previa de esa revisión en navegador: `document.fonts` da Geist y Geist Mono cargadas, la cabecera lleva `font-src data:` y la consola no registra errores.
- T006: 1.208 unitarias, 283 de integración en solitario, lint con 0 errores, typecheck y build.
- T007: revisión de seguridad sin hallazgos críticos ni altos. Corregidos: sin credencial en la ruta del informe, sin notas para el operador, propiedad visible en la fuente. Revisión de conformidad: corregidos el CSP de la vista previa, el límite que contradecía al objetivo, el pie sin Geist, la fuente que afirmaba una comparación inexistente, el límite de cifras en un informe sin cifras, la descripción de la tarjeta y los huecos de cobertura. Encontrado después: el límite decía que las cifras omiten búsquedas poco frecuentes, pero el informe muestra totales, que sí las incluyen.
