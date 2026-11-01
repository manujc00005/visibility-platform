# Feature Spec: Objetivo comercial por empresa

## Status

Ready (2026-11-01). Segunda spec de la fase B del cierre del MVP (`docs/visibility-mvp/19-cierre-mvp-fases.md`), hallazgo 14 de la auditoría de Codex del 2026-11-01 y recomendación 01 de su contraste de fuentes.

## Problem

La sección de Analytics lista los eventos clave configurados en GA4 (`close_convert_lead`, `qualify_lead`, `purchase`…) y suma «eventos clave desde buscadores», pero nadie ha dicho cuál de esos eventos es la conversión de esta empresa ni se ha comprobado que llegue. Un total de eventos clave puede sumar etapas de un mismo recorrido como si fueran clientes distintos, y «0» no se distingue de «la medición nunca ha recibido nada».

## Goal

Cada empresa puede declarar un objetivo comercial: qué tipo de resultado es (solicitud, reserva, compra u otro), cómo se llama para el propietario y qué evento clave de GA4 lo mide. El resumen muestra el objetivo con los contactos medidos desde buscadores en los últimos 28 días cuando la medición está verificada (alguna captura ha visto ese evento con valor mayor que cero), y «Pendiente de comprobar la medición» mientras no. Nunca suma eventos distintos ni presenta clics o etapas como clientes.

## Non-goals

- Cambiar lo que captura GA4 (spec 008): se usan las capturas guardadas; los eventos por nombre siguen siendo solo los del canal «Organic Search» (008 D003).
- Recepciones fuera de buscadores: GA4 solo guarda por evento el desglose orgánico; una recepción directa o de pago no verifica el objetivo (P2 si hace falta).
- Varios objetivos por empresa, embudos o etapas.
- Un veredicto («bien», «mal») sobre el número de contactos.
- Mostrar el objetivo en el informe PDF o en la página «Google» (017 y 021).
- Atribución causal entre acciones y contactos.

## Users / Actors

- Operador: declara el objetivo en la edición de la empresa a partir de los eventos clave que GA4 ya devolvió.
- Propietario: lee en el resumen cuántos contactos de ese tipo llegaron desde buscadores, o que la medición aún no está comprobada.

## Current behavior

- `analytics_snapshots.key_events` guarda `configured`, `total`, `organic` y `organicByEvent` (evento y número de eventos clave orgánicos del periodo actual).
- La sección de Analytics muestra ese bloque; el resumen no menciona conversiones.
- No existe ninguna tabla de objetivos.

## Desired behavior

1. **Declarar el objetivo.** En `/workspaces/[id]/edit`, debajo del formulario y encima de «Fuentes de datos», la sección «Objetivo comercial»: tipo (solicitud, reserva, compra, otro), nombre para el propietario («Solicitud de presupuesto») y evento de GA4, elegido entre los eventos clave configurados en la última captura buena; si no hay captura o la lista está vacía, un campo de texto con el nombre exacto del evento y una nota. Guardar, y quitar el objetivo.
2. **Verificación derivada, no declarada.** El objetivo está verificado si alguna captura buena guardada contiene el evento en `organicByEvent` con valor mayor que cero. Se guarda la fecha de esa captura y el fin de su periodo como «última recepción observada». No se guarda ningún estado de verificación: se calcula de lo capturado.
3. **Resumen.** Una línea bajo la cabecera, antes de «Lo más importante»:
   - sin objetivo: «Objetivo comercial sin definir» con enlace a definirlo (solo texto; el operador lo define en la edición);
   - verificado: «Solicitud de presupuesto: N desde buscadores en los últimos 28 días (Google Analytics, del X al Y)», con N = eventos clave orgánicos del evento en la última captura buena, 0 incluido; «Última recepción observada: fecha»;
   - pendiente: «Solicitud de presupuesto: pendiente de comprobar la medición. Google Analytics no ha registrado todavía ninguna recepción desde buscadores de este evento.»; si además el evento no figura entre los eventos clave configurados en la última captura, se añade «El evento no está marcado como evento clave en Google Analytics.»; sin ninguna captura de GA4, «Conecta Google Analytics para comprobarlo.»
4. **Honestidad de las cifras.** El texto siempre dice «desde buscadores», «eventos clave» y el periodo; nunca «clientes», «ventas» ni «leads». Un objetivo cuyo tipo es `otro` se describe solo por su nombre.
5. **Panel de fuentes (015)** no cambia.

## Functional requirements

- FR-001 Tabla `workspace_goals`: `workspace_id` PK y FK en cascada, `kind` en (`request`, `booking`, `purchase`, `other`), `label` 1–80 caracteres, `event_name` 1–200 caracteres sin espacios en los extremos, `created_at`, `updated_at`. `CHECK` de enumeración y longitudes. Migración aditiva `0018_workspace_goals`.
- FR-002 Módulo `src/modules/goals/`: `schema.ts`; `service.ts` con `getGoal`, `saveGoal` (upsert bajo el bloqueo de empresa, validación con mensajes en `es`/`en`), `removeGoal` y `goalEvidence(db, workspaceId, eventName)` que devuelve la captura buena más reciente cuyo `organicByEvent` contiene el evento con `keyEvents > 0` (`{ observedAt, periodEnd }`) o `null`, con una consulta `jsonb_path_exists` acotada por empresa.
- FR-003 Función pura `summarizeGoal({ goal, analytics: LatestAnalytics, evidence }, locale)` → `GoalView { state: "none" | "pending" | "verified"; kind; label; event; count: number | null; period; observedAt; notes: string[]; text }` según «Desired behavior» 3.
- FR-004 Componente cliente `GoalForm` (selección de evento entre `configured`, o texto libre con nota cuando no hay) con `GoalFormState` y acciones `saveGoalAction`/`removeGoalAction` en `src/app/workspaces/[id]/goal/actions.ts`; revalidan el resumen y la edición.
- FR-005 Componente servidor `GoalLine` en el resumen, con pill (verificado: `good` «Medido»; pendiente: neutro «Pendiente»; sin objetivo: neutro «Sin definir») y el texto de «Desired behavior» 3; enlace a la edición.
- FR-006 Textos en `es` y `en`; los tipos se muestran traducidos (solicitud / reserva / compra / otro).
- FR-007 Nada cambia en `analytics/*`, en la sección de Analytics ni en el informe.

## Non-functional requirements

- Performance: el resumen añade dos lecturas (objetivo y evidencia, esta última una consulta indexada por empresa y fecha); la edición añade una (objetivo).
- Security: `kind` y longitudes validados en servidor y por `CHECK`; `event_name` y `label` se muestran como texto. Perímetro D-03.
- Accessibility: la línea tiene pill con icono y texto; el formulario tiene etiquetas.

## API / Interface changes

- Nueva tabla y módulo `goals`. Nuevas acciones y componentes. Catálogo `goals.*`.

## Data model changes

- `workspace_goals` (FR-001). Sin cambios en `analytics_snapshots`.

## Edge cases

- Evento con mayúsculas o espacios: se guarda recortado, se compara exacto (GA4 distingue mayúsculas).
- Evento que GA4 deja de marcar como clave: sigue verificado si alguna captura lo vio; la nota avisa de que ya no está configurado.
- Captura buena con `keyEvents` nulo (anterior a la 008): no verifica ni cuenta.
- Verificado y 0 en el periodo actual: «0 desde buscadores…» con la última recepción observada.
- Borrar el objetivo: la línea vuelve a «sin definir»; la evidencia no se toca.
- Empresa sin GA4: pendiente con la nota de conectar.

## Acceptance criteria

- AC-001 Migración con `CHECK`: `kind` fuera de la lista, `label` vacío o de 81 caracteres y `event_name` vacío fallan con su restricción; borrar la empresa borra el objetivo.
- AC-002 `saveGoal` crea y actualiza (misma fila), recorta `event_name`, rechaza `validation` sin escribir y `not_found` para empresa desconocida; `removeGoal` elimina y es idempotente.
- AC-003 `goalEvidence` devuelve la captura más reciente con el evento mayor que cero, ignora capturas fallidas, capturas sin `keyEvents`, eventos a cero y otras empresas.
- AC-004 `summarizeGoal`: sin objetivo → `none`; objetivo sin evidencia y sin capturas → `pending` con la nota de conectar; con captura buena sin el evento configurado → `pending` con la nota de evento no configurado; con evidencia → `verified` con `count` de la última captura (0 si el evento no aparece), periodo y `observedAt`. En `es` y `en`, con los textos de «Desired behavior» 3 y sin las palabras «clientes», «ventas» ni «leads».
- AC-005 `GoalForm` muestra los eventos configurados como opciones y el campo de texto cuando no hay; conserva lo escrito tras un error; `GoalLine` renderiza los tres estados con pill y enlace.
- AC-006 En navegador sobre `dev`: Olessium con objetivo «Solicitud de contacto» sobre `close_convert_lead` muestra «pendiente de comprobar la medición» (GA4 no ha registrado eventos orgánicos); la clínica sin GA4 muestra la nota de conectar; quitar el objetivo devuelve «sin definir». A 375 px sin desbordamiento.
- AC-007 Lint, typecheck, unitarias, integración y build en verde.

## Test scenarios

- Unit: `tests/unit/goals/summary.test.ts` (AC-004), `tests/unit/goals/render.test.ts` (AC-005), catálogos.
- Integration: `tests/integration/goals.test.ts` (AC-001, AC-002, AC-003).
- Manual: AC-006.

## Assumptions

- Una empresa tiene un objetivo principal; los secundarios llegan con demanda.
- «Verificado» con el desglose orgánico es suficiente para el piloto: es la misma base que la 008 y lo que el producto promete (contactos desde buscadores).

## Open questions

- Ninguna.

## Contracted services

Esta feature no añade servicios de pago.
