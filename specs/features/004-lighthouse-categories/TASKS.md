# Tasks: Categorías de Lighthouse

- [x] T001 Petición con las cuatro categorías y `locale=es`; mapeo de categorías y fallos, con pruebas
- [x] T002 Vista pura por categoría y estados, con pruebas en es/en
- [x] T003 Textos en el catálogo es/en y llamadas representativas
- [x] T004 Bloque en la pestaña Google (SEO) y en Rendimiento (accesibilidad, buenas prácticas)
- [x] T005 Lint, typecheck, pruebas
  - 2026-10-31, repetido sobre `05c4f70`, encima de las specs 007–010: lint, typecheck, 939 unitarias, 188 de integración y build con código 0.
- [x] T006 Auditoría real de olessium.com
  - 2026-10-28: la clave actual devuelve «API key not valid» en PageSpeed y en CrUX, también con la petición antigua de solo rendimiento.
  - Verificado en navegador con una empresa de prueba temporal (auditoría real de example.com, PageSpeed simulado): SEO en Google, accesibilidad y buenas prácticas en Rendimiento, es/en, aviso de títulos en español, móvil sin scroll horizontal. Olessium muestra «No medido» porque su última auditoría es anterior. Empresa de prueba borrada.
  - 2026-10-28 10:27, clave nueva del proyecto `olessium`: auditoría `b04ac09a` con SEO 100/100 (10 comprobaciones), accesibilidad 95/100 (2 fallos: contraste de colores y orden de encabezados) y buenas prácticas 100/100 (13 comprobaciones), Lighthouse 13.5.0, títulos en español.
  - El intento anterior (`078bd49e`, 10:26) recibió HTTP 500 de PageSpeed y quedó sin velocidad ni categorías. Una petición directa con las mismas cuatro categorías minutos antes había respondido 200 en 16 s. Con una sola muestra no se puede descartar que pedir más categorías haga más frecuentes estos fallos.
- [x] T007 Un reintento ante 5xx de PageSpeed (D005), con pruebas
- [x] T008 Correcciones de las revisiones de seguridad y dominio (D006), con pruebas de modos, umbral, peso, saneado, plazo y render de la tarjeta
  - 2026-10-31: llamada real a PageSpeed de olessium.com, sin guardar, con el código corregido: 200 en 12 s y 562 KB. Ninguno de los 153 `id` queda fuera del filtro. SEO 100/100 (10 comprobaciones), accesibilidad 95/100 (28, con contraste y orden de encabezados), buenas prácticas 100/100 (12). Dos comprobaciones con peso 0 quedan fuera, y 47 títulos traían acentos graves.
