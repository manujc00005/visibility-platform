---
name: Visibility Platform
description: Diagnóstico SEO y de visibilidad en IA para pymes, con fuente y fecha en cada cifra.
colors:
  iris: "oklch(0.5 0.21 290)"
  iris-soft: "oklch(0.955 0.03 292)"
  iris-ink: "oklch(0.33 0.13 285)"
  ink: "oklch(0.19 0.025 285)"
  ink-muted: "oklch(0.49 0.025 285)"
  cool-paper: "oklch(0.984 0.004 286)"
  card-white: "oklch(1 0 0)"
  mist: "oklch(0.962 0.008 286)"
  hairline: "oklch(0.912 0.012 286)"
  field-line: "oklch(0.9 0.014 286)"
  focus-ring: "oklch(0.52 0.2 290)"
  good: "oklch(0.448 0.119 151.328)"
  good-soft: "oklch(0.982 0.018 155.826)"
  good-line: "oklch(0.723 0.219 149.579)"
  fair: "oklch(0.473 0.137 46.201)"
  fair-soft: "oklch(0.987 0.022 95.277)"
  fair-line: "oklch(0.769 0.188 70.08)"
  bad: "oklch(0.505 0.213 27.518)"
  bad-soft: "oklch(0.971 0.013 17.38)"
  bad-line: "oklch(0.637 0.237 25.331)"
  info: "oklch(0.488 0.243 264.376)"
  info-soft: "oklch(0.97 0.014 254.604)"
  info-line: "oklch(0.623 0.214 259.815)"
  destructive: "oklch(0.577 0.245 27.325)"
typography:
  display:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "2.25rem"
    fontWeight: 600
    lineHeight: 1.25
    letterSpacing: "-0.025em"
    fontFeature: "tnum"
  headline:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1.875rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "-0.025em"
  title:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 600
    lineHeight: 1.43
    letterSpacing: "-0.025em"
  body:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.43
  label:
    fontFamily: "Geist, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 500
    lineHeight: 1.33
  mono:
    fontFamily: "Geist Mono, ui-monospace, monospace"
    fontSize: "0.875rem"
    fontWeight: 400
rounded:
  sm: "6px"
  md: "8px"
  lg: "10px"
  xl: "14px"
  2xl: "18px"
  full: "9999px"
spacing:
  1: "4px"
  2: "8px"
  3: "12px"
  4: "16px"
  6: "24px"
  8: "32px"
components:
  button-primary:
    backgroundColor: "{colors.iris-ink}"
    textColor: "{colors.card-white}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-outline:
    backgroundColor: "{colors.cool-paper}"
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  button-ghost:
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "0 10px"
    height: "32px"
  input:
    textColor: "{colors.ink}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    height: "32px"
  overview-card:
    backgroundColor: "{colors.card-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.2xl}"
    padding: "24px"
  status-pill-good:
    backgroundColor: "{colors.good-soft}"
    textColor: "{colors.good}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  status-pill-fair:
    backgroundColor: "{colors.fair-soft}"
    textColor: "{colors.fair}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  status-pill-bad:
    backgroundColor: "{colors.bad-soft}"
    textColor: "{colors.bad}"
    rounded: "{rounded.full}"
    padding: "2px 8px"
  nav-tab:
    textColor: "{colors.ink-muted}"
    rounded: "{rounded.md}"
    padding: "0 12px"
    height: "40px"
---

# Design System: Visibility Platform

## Overview

**Creative North Star: "El parte del técnico"**

La interfaz se lee como el parte que deja un buen técnico al terminar una revisión: claro, ordenado y honrado. Cada cifra dice de dónde sale y cuándo se midió, cada estado lleva su palabra y su icono, y nada decorativo pretende dar más confianza de la que dan los datos. El propietario de la pyme tiene que poder leerlo sin ayuda; el operador, trabajar con él a diario sin fatiga.

El sistema es sereno y preciso. Parte de neutros con un leve tinte frío hacia el violeta, sobre los que se apoyan tarjetas blancas con una sombra ambiental muy baja. Hay un solo color de identidad, Iris, que marca dónde estás y qué puedes hacer, nunca si algo va bien o mal. Ese trabajo es exclusivo de un semáforo de cuatro tonos (bien, mejorable, mal, información), que siempre va acompañado de icono y texto. La densidad es media: texto base a 14 px, mucho aire entre bloques y una sola cifra grande por tarjeta.

La única licencia expresiva es atmosférica: un resplandor Iris muy difuso detrás de la cabecera de la página, que desaparece al desplazarse, y la leve elevación de las tarjetas al pasar el ratón.

**Key Characteristics:**
- Neutros fríos tintados hacia el violeta (matiz 285–286) en lugar de grises puros.
- Un único acento de identidad (Iris) y un semáforo separado, reservado a estados.
- Tarjetas blancas sobre papel frío, con sombra ambiental y elevación solo al pasar el ratón.
- Una sola tipografía (Geist) con jerarquía por peso y tamaño; Geist Mono solo para dominios y datos literales.
- Fuente y fecha visibles en el pie de cada tarjeta.

## Colors

Una paleta casi monocroma de neutros fríos, con un acento violeta de identidad y un semáforo semántico que solo aparece cuando hay un estado que comunicar.

### Primary
- **Iris** (`iris`): el acento de marca. Se usa en el logo (degradado de Iris a Tinta Iris), el subrayado de la pestaña y del enlace de navegación activos, los iconos de las tarjetas del resumen, los enlaces «Ver informe», la numeración de oportunidades y el resplandor del fondo. Su variante suave, **Iris Velado** (`iris-soft`), es el fondo de los iconos de tarjeta.
- **Tinta Iris** (`iris-ink`): un violeta casi negro, el relleno del botón principal. Es la acción más fuerte de cualquier pantalla y no aparece más de una vez por zona.

### Neutral
- **Tinta** (`ink`): el texto principal y los títulos.
- **Tinta Apagada** (`ink-muted`): descripciones, metadatos, fuentes, migas de pan y pestañas inactivas.
- **Papel Frío** (`cool-paper`): el fondo de la página, apenas tintado de violeta.
- **Blanco de Tarjeta** (`card-white`): tarjetas, popovers y la cabecera fija (al 85 % de opacidad, con desenfoque).
- **Niebla** (`mist`): fondos atenuados, el pie de las tarjetas (al 50 %) y los estados de hover de los botones fantasma.
- **Filete** (`hairline`) y **Línea de Campo** (`field-line`): bordes de tarjeta y de campo de formulario.
- **Anillo de Foco** (`focus-ring`): el contorno de foco de botones y campos (al 50 % de opacidad).

### Semáforo (estados)
- **Bien** (`good`, `good-soft`, `good-line`), **Mejorable** (`fair`, …), **Mal** (`bad`, …) e **Información** (`info`, …). Cada tono tiene tres usos: texto e icono, fondo suave y línea o acento. Los tonos de texto mantienen un contraste de al menos 4,5:1 sobre su fondo suave y sobre blanco. El estado neutro («Sin datos», «No comprobado») usa Tinta Apagada sobre Niebla.
- **Escala de veredictos.** Todas las superficies (resumen, páginas de detalle e informe PDF) comparten una sola escala: **Bien** (verde), **Mejorable** (ámbar), **Mal** (rojo), **Opcional** (información) y **Parcial** o **No comprobado** (neutro); la misma palabra siempre lleva el mismo tono y cada tono tiene una sola palabra. Las severidades de los problemas siguen la misma correspondencia: **Crítico** (rojo), **Importante** (ámbar), **Opcional** (azul), y sus recuentos se titulan «Críticos», «Importantes» y «Opcionales». Las métricas de velocidad conservan la terminología de Google (Bueno / Mejorable / Malo), con «Mejorable» en ámbar como en el resto. «Mejora» y «Empeora» se reservan a la dirección del cambio frente a la medición anterior y nunca nombran un problema ni un veredicto.

**La regla de la medición incompleta.** Que una medición esté incompleta es un dato sobre la captura, no un veredicto: «Parcial» va en neutro y nunca en ámbar. Solo hereda tono cuando lo que sí se midió ya tiene severidad («Mal (parcial)»).
- **Destructivo** (`destructive`): solo para acciones que borran o invalidan, nunca para el estado de una métrica.

### Named Rules
**La regla del acento sin juicio.** Iris dice «esto es la marca» o «aquí puedes ir», nunca «esto va bien». Si un elemento comunica calidad o estado, su color sale del semáforo, no de Iris.

**La regla del color con palabra.** Ningún color significa algo por sí solo: todo tono del semáforo va con su icono (círculo con check, triángulo, círculo con aspa, bombilla, círculo discontinuo) y una etiqueta de texto.

**La regla del neutro tintado.** No hay grises puros en el tema claro; todo neutro lleva un tinte frío hacia el matiz 285–286.

## Typography

**Display Font:** Geist (con `ui-sans-serif`, `system-ui`)
**Body Font:** Geist
**Label/Mono Font:** Geist Mono, solo para dominios y valores literales

**Character:** una sola familia geométrica y neutra, que jerarquiza por peso y tamaño en lugar de por contraste de familias. Los títulos se aprietan ligeramente (`tracking-tight`) y las cifras usan dígitos tabulares para que se alineen y comparen.

### Hierarchy
- **Display** (600, 2,25 rem, 1,25, cifras tabulares): la cifra principal de cada tarjeta del resumen («62/100», «1 de 4»). Una por tarjeta.
- **Headline** (600, 1,5 rem en móvil y 1,875 rem desde `sm`, interlineado ajustado): el `h1` de cada página, con corte de palabra para nombres largos.
- **Title** (600, 0,875–1 rem): títulos de tarjeta y de sección.
- **Body** (400, 0,875 rem, 1,43): todo el texto corrido. Las descripciones se limitan a `max-w-2xl` (42 rem) y las páginas de lectura a `max-w-3xl` (48 rem).
- **Label** (500, 0,75 rem): pastillas de estado, fuentes, avisos y metadatos.

### Named Rules
**La regla de la cifra única.** Cada tarjeta tiene exactamente una cifra en Display. Si hacen falta dos números grandes, son dos tarjetas o una tabla.

**La regla del cero con denominador.** Una cifra en Display nunca es un cero suelto: el cero solo aparece con su denominador («0 de 4»), y sin medición se escribe el estado («No medida»).

## Layout

Columna única centrada de `max-w-5xl` (64 rem), con márgenes laterales de 16 px en móvil y 24 px desde `sm`, y 32 px de aire vertical. La cabecera es fija, de 3,5 rem (`--header-height`), y `scroll-padding-top` evita que tape los destinos de ancla y el foco.

El ritmo usa la escala de 4 px de Tailwind: 8–12 px dentro de los componentes, 16 px entre bloques relacionados, 24–32 px entre secciones. El resumen coloca hasta cuatro tarjetas en rejilla 2×2 en escritorio y una columna en móvil, con la misma altura por fila; con un número impar, la última ocupa las dos columnas para que ninguna quede sola. Solo las áreas con resultado tienen tarjeta; las demás van en la lista «Pendiente de medir» debajo. Las páginas de detalle apilan secciones.

En móvil, las pestañas de la empresa se desplazan en horizontal sin barra visible, «Presencia en IA» se abrevia a «IA», el nombre de marca de la cabecera queda solo para lectores de pantalla y las acciones de la cabecera de página pasan debajo del título.

## Elevation & Depth

Es un sistema por capas: tarjetas blancas sobre papel frío, separadas por una sombra ambiental muy baja y un filete. La profundidad no es estructural; las tarjetas no se apilan ni se solapan. La elevación responde a la interacción: al pasar el ratón, la tarjeta del resumen sube 2 px, la sombra se alarga y aparece un fino filo Iris en su borde superior.

### Shadow Vocabulary
- **Tarjeta en reposo** (`box-shadow: 0 1px 2px oklch(0.25 0.04 285 / 0.05), 0 10px 30px -18px oklch(0.25 0.06 285 / 0.18)`): tarjetas del resumen y superficies principales.
- **Tarjeta en hover** (`box-shadow: 0 1px 2px oklch(0.25 0.04 285 / 0.06), 0 18px 40px -20px oklch(0.3 0.1 285 / 0.3)`): solo en tarjetas que son un enlace.

### Named Rules
**La regla de la sombra que responde.** Una sombra más marcada solo aparece como respuesta a una interacción. En reposo, todo está a la misma altura.

## Shapes

Esquinas suavemente redondeadas, derivadas de un radio base de 10 px (`--radius: 0.625rem`): 10 px en botones y campos, 14 px en tarjetas genéricas y 18 px en las tarjetas del resumen. Las pastillas de estado y las insignias son completamente redondas. Los indicadores de pestaña activa son una barra de 2 px con extremos redondeados. Los bordes son filetes de 1 px; el único borde grueso es el acento izquierdo de 4 px de las teselas de métrica y de las filas de métricas de velocidad, en el tono del semáforo correspondiente.

## Components

### Buttons
Comedidos, compactos y siempre con foco visible.
- **Shape:** suavemente redondeados (10 px), 32 px de alto en tamaño por defecto y 36 px en grande.
- **Primary:** relleno Tinta Iris con texto blanco; en hover baja al 80 % de opacidad. Al pulsar, el botón baja 1 px.
- **Outline:** borde Filete sobre el fondo de página y hover en Niebla. Es la acción secundaria («Editar»).
- **Ghost / Link:** sin fondo hasta el hover; el enlace usa Tinta Iris con subrayado al pasar el ratón.
- **Destructive:** fondo destructivo al 10 % con texto destructivo, nunca relleno sólido.
- **Focus:** borde Anillo de Foco y halo de 3 px al 50 %.

### Status pill
La pieza básica del semáforo, en dos pesos. La **suave**: pastilla redonda con borde de línea, fondo suave, texto del tono e icono de 14 px, junto a cada métrica. La **sólida**: relleno con el tono de texto (contraste ≥ 4,5:1 con blanco), texto blanco en semibold e icono; es el veredicto de un bloque entero y va en la esquina superior derecha de las tarjetas del resumen y en la llamada de la primera oportunidad. El estado neutro usa siempre la suave.

### Cards / Containers
- **Corner Style:** 18 px en las tarjetas del resumen y 14 px en las genéricas.
- **Background:** Blanco de Tarjeta sobre Papel Frío.
- **Shadow Strategy:** Tarjeta en reposo, y Tarjeta en hover cuando la tarjeta es un enlace (ver Elevation & Depth).
- **Border:** Filete al 80 %; en hover, Iris al 30 %.
- **Internal Padding:** 24 px en las tarjetas del resumen y 16 px en las genéricas (12 px en la talla pequeña).

### Inputs / Fields
- **Style:** borde Línea de Campo de 1 px, fondo transparente, radio de 10 px y 32 px de alto. El texto es de 16 px en móvil, para evitar el zoom de iOS, y de 14 px desde `md`.
- **Focus:** borde Anillo de Foco y halo de 3 px al 50 %.
- **Error / Disabled:** `aria-invalid` cambia el borde y el halo al tono destructivo; deshabilitado, al 50 % de opacidad sobre fondo atenuado.

### Navigation
- **Cabecera:** fija, Blanco de Tarjeta al 85 % con desenfoque y filete inferior. Contiene el logo (cuadrado de 28 px con degradado de Iris a Tinta Iris y el icono de radar), los enlaces principales y el selector de idioma, además de un enlace para saltar al contenido.
- **Pestañas de empresa:** Resumen · Rendimiento · Google · Presencia en IA, en Label/Title de peso 500 y Tinta Apagada. La activa pasa a Tinta, con una barra Iris de 2 px apoyada sobre el filete inferior y `aria-current="page"`.
- **Migas de pan:** texto pequeño en Tinta Apagada, separado por chevrones de 14 px.

### Overview card (componente propio)
La tarjeta del resumen es un único enlace sin controles dentro y **viste su veredicto**: una barra de 4 px arriba en la línea del tono, el borde en esa misma línea, el icono en un cuadrado de 36 px con el fondo suave del tono y la cifra en Display en el color de texto del tono. Una tarjeta neutra (sin juicio: «Medido», «Parcial») conserva el filete, el cuadrado Iris Velado y la cifra en Tinta. Arriba lleva el icono, el título y la pastilla sólida de estado. Los títulos son preguntas del propietario («¿Cómo funciona tu web?», «¿Puede Google leer tu portada?», «¿Te encuentran en Google?», «¿Apareces en las respuestas de IA?»). Debajo, la cifra en Display y las líneas de apoyo. Al final, un pie a sangre en Niebla con la fuente y la fecha a la izquierda y «Ver informe ›» en Iris a la derecha. Los cambios frente a la medición anterior van en un chip (fondo suave, borde de línea, flecha) que empieza por la palabra de dirección en semibold («Mejora · 2 problemas menos…», «Empeora · Antes: 511 clics»), para que una cifra dentro de la frase nunca se lea como un recuento de problemas; los avisos (actualizando, intento fallido, datos antiguos) van en Label con su icono.

### Situation line (componente propio)
Una línea de texto bajo las pestañas del resumen: un fragmento por área, en el orden de las tarjetas, separados por un punto medio en escritorio y uno por línea en móvil. Tamaño Body a 1 rem, en Tinta. Cada fragmento lleva delante el icono del tono de su tarjeta (el mismo que la pastilla) y va en peso 500; los neutros, en Tinta Apagada. Sin pastillas, sin cifras y sin palabras que sumen áreas: cada fragmento repite en palabras el estado de su tarjeta. Sin ninguna área medida, no aparece.

### Pending list (componente propio)
La lista «Pendiente de medir»: un contenedor de 14 px de radio con fondo Blanco de Tarjeta al 60 %, filas separadas por filetes y, en cada una, el círculo discontinuo del estado neutro, la pregunta de la tarjeta en peso 500 y el motivo en Tinta Apagada. Es texto: no lleva enlaces, porque no hay informe detrás.

### Metric tile (componente propio)
Tesela de 10 px de radio con acento izquierdo de 4 px en el tono del semáforo. Contiene la etiqueta en Label, el valor a 1,25 rem en semibold tabular, la pastilla con el veredicto y la referencia de lo que es «bueno».

### Verdict block
El bloque principal de cada página de detalle (puntuación móvil, salud técnica, cobertura en IA, categorías de Lighthouse) usa el mismo lenguaje que la tarjeta del resumen: barra de 4 px arriba y borde en la línea del tono, cifra o titular en el color de texto del tono y pastilla sólida en la línea del título, arriba a la derecha, como en la tarjeta del resumen. Las filas y teselas que dependen de él llevan el acento izquierdo de 4 px en su propio tono solo en las métricas de velocidad y en los recuentos por severidad; una tesela de recuento solo viste su severidad cuando cuenta algo. Las tarjetas completas que dependen de él (estado por área, problemas, grupos de preguntas de IA) conservan el filete de 1 px y muestran su tono con su pastilla (los grupos de preguntas de IA no llevan tono: su título dice qué hizo ChatGPT), nunca con un borde grueso. Los chips de cambio con palabra de dirección se usan también en las teselas de Search Console, Bing y Analytics.

## Do's and Don'ts

### Do:
- **Do** poner fuente y fecha en el pie de cada tarjeta y junto a cada cifra.
- **Do** acompañar cada tono del semáforo con su icono y una palabra (Bien, Mejorable, Mal…).
- **Do** usar dígitos tabulares en cualquier cifra que se compare o se alinee.
- **Do** mantener los neutros tintados hacia el matiz 285–286 al añadir superficies nuevas.
- **Do** respetar `motion-reduce`: la elevación y los desplazamientos al pasar el ratón se anulan.
- **Do** mostrar el foco visible en todo elemento interactivo (halo de 2–3 px).

### Don't:
- **Don't** dar tarjeta completa a un área sin resultado: va a la lista «Pendiente de medir».
- **Don't** poner acciones de operador en el resumen («Analizar portada», «Configurar»): viven en Configuración y en las páginas de detalle.
- **Don't** usar Iris ni Tinta Iris para indicar que algo va bien o mal.
- **Don't** colorear una tarjeta del resumen con un tono que su pastilla no diga: barra, borde y cifra toman siempre el tono de la pastilla, nunca uno propio por métrica.
- **Don't** mostrar una puntuación compuesta ni un cero sin denominador.
- **Don't** meter botones ni enlaces dentro de una tarjeta que ya es un enlace.
- **Don't** usar grises puros en el tema claro.
- **Don't** dar por bueno el tema oscuro: los tokens `.dark` son los de shadcn por defecto (grises neutros, sin tinte) y ninguna parte de la app lo activa.
