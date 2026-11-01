# Product

<!-- impeccable:product-schema 1 -->

## Platform

web

## Users

Dos públicos, separados por superficie:

- **Propietario de la pyme (principal).** Pyme o negocio local en España (1–50 empleados: clínicas, despachos, talleres, reformas, restauración, formación, comercio con tienda, B2B regional) con web propia y sin equipo SEO. Decide el propietario o gerente, sin conocimientos de SEO, GEO ni AEO. Quiere saber en pocos minutos cómo le ven Google y los asistentes de IA frente a sus competidores, qué falla en su web y qué arreglar primero. Es el público del resumen de la empresa y de sus detalles (Rendimiento, Google, Presencia en IA), y del informe PDF.
- **Operador.** Quien presta el servicio (hoy el único usuario, sin autenticación). Da de alta empresas, lanza auditorías, configura la medición en IA (alias, competidores, preguntas, perfil de negocio) y genera informes. Es el público del panel de inicio, el listado de empresas, los formularios de alta y edición y la configuración de la medición en IA.
- **Agencia pequeña de marketing o diseño web (secundario, P1).** 1–10 personas con 5–30 clientes, un workspace por cliente, que necesita un informe mensual que justifique su trabajo. El modelo de datos ya lo admite; la UI de agencia no está construida.

## Product Purpose

Diagnóstico SEO y de visibilidad en buscadores con IA para pymes. Muestra cómo está posicionado un negocio en Google, si aparece en las respuestas de ChatGPT y de los AI Overviews, cómo se compara con sus competidores, qué problemas técnicos tiene su web y qué acciones priorizar, todo en lenguaje de propietario. Recorrido comercial: auditoría puntual de pago (informe PDF más dashboard), luego seguimiento semanal opcional y solicitudes de servicios profesionales que nacen del informe.

Éxito: al abrir su empresa, el propietario responde sin ayuda cómo funciona su web, si le encuentran en Google, si aparece en respuestas de IA, si está mejorando y qué debería mejorar primero.

## Positioning

A diferencia de las herramientas de especialista (Semrush, Ahrefs, Otterly, Peec, SE Ranking), está pensado para el propietario y no para el especialista. Junta en un informe que entiende alguien no experto la auditoría técnica, la visibilidad en IA y el camino a un servicio profesional. Cada cifra es trazable (fuente, nº de muestras, condición de captura y fecha), nunca muestra una «puntuación SEO» compuesta y se cobra por auditoría o por marca, nunca por asiento ni por prompt.

## Operating Context

- Hoy es un proceso asistido por el operador: crea la empresa, lanza la auditoría y la medición en IA y entrega el PDF. El acceso directo del cliente y el pago con Stripe llegan en la Fase 5 (la siguiente).
- Fuentes de datos: PageSpeed Insights, Chrome UX Report, la auditoría técnica propia, Google Search Console, Bing Webmaster Tools, GA4 y mediciones en ChatGPT (captura asistida; DataForSEO está implementado pero sin verificar).
- El PDF se imprime con Chromium headless desde la misma plantilla HTML que la vista web, a partir de snapshots congelados que se pueden regenerar byte a byte.
- La interfaz es bilingüe, español (por defecto) e inglés, y el idioma se elige por cookie.

## Capabilities and Constraints

- Stack existente: Next.js 16 (App Router), React 19, Tailwind con shadcn/ui y Base UI, lucide-react, Drizzle sobre Neon PostgreSQL.
- Navegación de empresa: pestañas Resumen · Rendimiento · Google · Presencia en IA (en móvil, «IA») y ruta Empresas › empresa › sección. La especificación funcional del resumen está en `docs/visibility-mvp/17-dashboard-product-design.md` y en `specs/features/002-dashboard-overview/`.
- Estados explícitos en cada métrica: sin configurar, sin datos, analizando, parcial, error, datos antiguos (> 30 días) e intento posterior en curso o fallido. Resultado e intento son dimensiones separadas.
- Nunca se muestra un cero sin medición; un cero solo aparece con denominador válido («0 de 4»).
- Lo que el producto no es: un CRM, un generador de webs, un redactor de contenidos, un agente autónomo que modifica la web del cliente, un rank tracker de especialista (ni top 100 diario, ni backlinks, ni autoridad de dominio) ni una herramienta de «volumen de prompts» o de «ranking universal IA». No promete atribución causal de la visibilidad a las ventas.
- Sin decidir: el nombre comercial (ver Brand Commitments) y los precios definitivos (todos los precios son hipótesis en `docs/visibility-mvp/01-product-vision.md` §6).

## Brand Commitments

- «Visibility Platform» es un nombre **provisional**. El trabajo futuro no debe tratarlo como marca fijada ni construir identidad alrededor de ese nombre.
- Voz: lenguaje de propietario. Cada métrica técnica lleva una frase de lo que significa y de qué es «bueno»; nada de jerga fuera del anexo técnico. Los textos describen lo que se preguntó, se respondió o se midió, y no diagnostican carencias que no se analizaron (D021).

## Evidence on Hand

- Cliente piloto real usado para la verificación: Olessium (agencia de estrategia, marketing, automatización e IA), con mediciones reales en ChatGPT (spec 012).
- Capturas del dashboard con datos de demo y fixtures de estados a 1280 px y 375 px: `docs/visibility-mvp/assets/17-dashboard/`, además de las capturas de i18n en `docs/visibility-mvp/assets/18-i18n/`.
- No hay testimonios, clientes publicados, casos de estudio, prensa ni benchmarks. No se pueden inventar.

## Product Principles

1. **Solo lo observado, con fuente y fecha.** Cada cifra dice de dónde sale, en cuántas muestras se basa y cuándo se midió. Lo que no se midió se dice, en vez de rellenar el hueco.
2. **Sin puntuación compuesta.** Cada área muestra su propia medida (puntuación de Google, conteos de problemas, «k de n preguntas») y nunca un agregado inventado.
3. **Primero el propietario.** Cada pantalla que ve el cliente responde qué pasa, por qué importa y qué hacer, en lenguaje llano; la profundidad técnica va al detalle y al anexo.
4. **Importa más la acción que el dashboard.** Todo lleva a una oportunidad priorizada, a una propuesta de servicio o a un seguimiento, no a un panel que se mira una vez.
5. **Comparaciones honestas.** Solo se comparan mediciones equivalentes (misma estrategia, versión, configuración y cobertura); si no, «Sin comparación».

## Accessibility & Inclusion

No hay un estándar formal comprometido. Prácticas ya aplicadas que hay que conservar: el color nunca significa nada por sí solo (siempre va con icono y texto), el foco es visible, las tarjetas completas son un único enlace con nombre accesible y las gráficas llevan detrás una tabla oculta para lectores de pantalla.
