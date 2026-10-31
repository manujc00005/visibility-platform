# Decisions: Categorías de Lighthouse

### D001 - Una sola llamada a PageSpeed

Se añaden las categorías a la petición existente. Una segunda llamada duplicaría tiempo y cuota, y daría puntuaciones de ejecuciones distintas de Lighthouse.

### D002 - Títulos de Lighthouse en español, guardados con la auditoría

La auditoría se ejecuta una vez y en un idioma; pedirla dos veces no es viable (D001). Se pide `locale=es`, idioma de referencia del producto, y se guarda `textLocale: "es"`. En inglés se muestran como contenido original con aviso, como ya hace la interfaz con la evidencia de los hallazgos.

### D003 - Puntuaciones aparte de los hallazgos propios

Las comprobaciones de Lighthouse se solapan con las 40 reglas propias. Mezclarlas cambiaría las cifras de problemas, el histórico y `RULES_VERSION`. Se muestran como un bloque separado, atribuido a Google Lighthouse.

### D004 - SEO en Google, accesibilidad y buenas prácticas en Rendimiento

Cada puntuación va donde el propietario busca ese tema.

### D005 - Un reintento ante 5xx de PageSpeed

El 2026-10-28 PageSpeed respondió 500 en una auditoría y 200 en la repetición, un minuto después. Se repite una vez tras 2 s cuando la respuesta es 5xx. No se repiten los timeouts ni los errores de red, porque una ejecución ya puede tardar 60 s y la auditoría la espera. Tampoco se repiten 429 (cuota) ni otros 4xx, que no se arreglan repitiendo.

### D006 - Correcciones de las revisiones de cierre

**Date:** 2026-10-31

Las revisiones de seguridad y dominio encontraron estos puntos, que se corrigen antes de cerrar:

- **Peso 0:** una comprobación sin peso no mueve la puntuación, así que no cuenta como puntuada ni como fallida. Con la regla original, una tarjeta podía decir 100/100 junto a una comprobación no superada.
- **Un solo plazo:** el reintento de D005 comparte los 60 s con el primer intento. Con un plazo por intento, la espera llegaba a 122 s y la spec decía que el límite se mantenía.
- **Texto saneado:** se descartan los `id` que no parecen de Lighthouse y las referencias repetidas, y los títulos pierden NUL y sustitutos sueltos. Si no, un solo texto hace que Postgres rechace el `jsonb` y se pierde la auditoría entera.
- **Puntuación fuera de rango:** se trata como nula, y una categoría sin comprobaciones puntuadas pasa a «sin puntuación» en lugar de un 0 medido.
- **Presentación:** singular en «supera…», `lang` en los títulos en español de la interfaz inglesa y sin acentos graves del markdown de Lighthouse.

Quedan aceptados: el bloque SEO aparece también sin auditoría, con su texto de «sin auditoría» (FR-006), y la respuesta de PageSpeed no tiene tope de bytes, como las de CrUX, Search Console, GA4 y Bing. No se ha visto en pantalla un título sin traducción propia con datos reales, solo con datos simulados y en pruebas: la auditoría real de Olessium tiene 2 fallos y ambos tienen texto propio.
