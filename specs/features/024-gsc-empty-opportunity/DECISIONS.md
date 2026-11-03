# Decisions: 024 — Oportunidad cuando Google no muestra la web

## Decision log

### D001 - Solo el estado vacío genera la oportunidad

**Date:** 2026-11-03

**Status:** Accepted

**Context:** La crítica del 2026-11-02 señaló que Olessium termina sin acciones con el hallazgo más grave a la vista. La 014 D002 prohíbe un veredicto sobre clics sin umbral.

**Decision:** solo `empty` (conectado, cero impresiones en los dos periodos) genera la oportunidad, de prioridad media. Ningún otro estado ni cifra baja.

**Reasoning:** cero en los dos periodos es un hecho medido, no una valoración; cualquier otro corte necesitaría un umbral que no existe.

**Consequences:** `buildOpportunities` recibe el resumen de Search Console. El texto describe lo medido y propone comprobar la indexación, sin afirmar la causa.
