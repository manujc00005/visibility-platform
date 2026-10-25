# 13 — Revisión cruzada de Codex

> **Este documento está vacío a propósito.** Está reservado para la revisión independiente de Codex sobre la versión 1 del diseño (`00` a `12`). Nadie salvo Codex debe rellenar las secciones 3 a 5. Hasta que esté completo y el owner firme, **ninguna decisión de `00`–`12` está aprobada**.

## 1. Cabecera

| Campo | Valor |
|---|---|
| Revisor | Codex |
| Fecha de revisión | _pendiente_ |
| Commit revisado de `visibility-platform` | _pendiente_ |
| Commit de `lead-platform` contrastado | `983dfb6` (el mismo que revisaron ambos informes originales; si ha cambiado, indicarlo) |
| Alcance | `docs/visibility-mvp/00` a `12`, más los dos informes originales en `lead-platform-workspace/docs/audits/` |
| Método | Lectura completa; contraste con código y con fuentes públicas donde aplique; sin modificar código ni documentos |

## 2. Instrucciones para el revisor

1. **No tratar ninguna decisión como aprobada.** Todos los ADR de `12-adr.md` están en estado PROPUESTO. La versión 1 consolidó tu informe y el de Claude; donde hubo desacuerdo, `00-analysis-comparison.md` §6 explica la resolución y qué evidencia la cerraría. Puedes objetar cualquiera, incluidas las que coinciden con tu informe original.
2. **Etiquetar cada hallazgo** con una de estas cuatro etiquetas:
   - **ACEPTO** — la decisión o el contenido es correcto tal como está.
   - **OBJETO** — discrepas; indica la alternativa y la evidencia.
   - **FALTA** — algo necesario no aparece (requisito, riesgo, entidad, prueba, coste).
   - **PREGUNTA** — necesitas aclaración antes de pronunciarte.
3. **Citar documento y sección** (`04-architecture.md §5`, `ADR-009`, `HU-21`).
4. **Aportar evidencia o prueba propuesta**: ruta de código, URL con fecha de lectura, cálculo, o el experimento que resolvería la duda.
5. **No reescribir los documentos.** Solo anotarlos aquí. Los cambios los incorpora el autor de la versión 2 citando este documento.
6. **Etiquetar afirmaciones** sobre `lead-platform` o proveedores como VERIFIED / INFERRED / UNVERIFIED, igual que en `00` §2.
7. Si detectas que `00`–`12` atribuye a tu informe algo que no dice, márcalo como **OBJETO** con prioridad alta: es el error que más importa corregir.

## 3. Hallazgos

| # | Etiqueta | Documento y sección | Hallazgo | Evidencia o prueba propuesta | Prioridad (alta / media / baja) |
|---|---|---|---|---|---|
| 1 | | | | | |
| 2 | | | | | |
| 3 | | | | | |
| … | | | | | |

## 4. Respuestas a las preguntas de `11-risks-and-open-decisions.md` §5

| # | Pregunta (resumen) | Respuesta de Codex |
|---|---|---|
| 1 | Tenancy de dos niveles frente a tres | |
| 2 | Superficies `chatgpt + google_aio` y experimento de estabilidad | |
| 3 | `report_snapshots` frente a tu objeción a snapshots genéricos | |
| 4 | Reserva de presupuesto (HU-08) frente a tu análisis de `budget.ts` | |
| 5 | Auditoría acotada frente al veto al crawler exhaustivo | |
| 6 | Auditoría de pago como primer paso frente al piloto asistido con herramienta comprada | |
| 7 | Estimación 57–80 j frente a tu 30–45 j | |
| 8 | Texto a pedir a DataForSEO para cerrar la licencia | |
| 9 | Lista de módulos copiados / reescritos (ADR-004) | |
| 10 | Qué falta de tu informe en `00`–`12` | |

## 5. Veredicto

Marcar una opción:

- [ ] **Apto para aprobación del owner** — sin objeciones de prioridad alta.
- [ ] **Apto con cambios** — objeciones listadas; el autor produce la versión 2 y Codex la revisa solo en los puntos marcados.
- [ ] **No apto** — una o más decisiones estructurales (ADR-001, 005, 008, 010) requieren rediseño.

Justificación del veredicto:

_pendiente_

## 6. Regla de cierre

La arquitectura pasa de PROPUESTO a **ACEPTADO** únicamente cuando se cumplen, en este orden:

1. Codex completa las secciones 3, 4 y 5 de este documento.
2. El autor incorpora los hallazgos en una versión 2 de `00`–`12`, citando el número de hallazgo en cada cambio, o justifica por escrito por qué no lo incorpora.
3. Codex confirma, en una adenda a este documento, que los hallazgos de prioridad alta quedan resueltos.
4. El owner firma, con fecha, al pie de `12-adr.md` y toma las decisiones D-01 a D-12 de `11-risks-and-open-decisions.md` §3 que bloquean P0.

Hasta entonces, cualquier documento de `docs/visibility-mvp/` debe leerse como propuesta.

---

_Firma del revisor:_ _pendiente_
_Firma del owner tras incorporar la revisión:_ _pendiente_
