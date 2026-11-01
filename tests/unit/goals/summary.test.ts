import { describe, expect, it } from "vitest";
import type { AnalyticsSnapshot } from "@/modules/analytics/schema";
import type { WorkspaceGoal } from "@/modules/goals/schema";
import { summarizeGoal } from "@/modules/goals/summary";

/** The goal line (feature 016, AC-004): verified only from captures; counts say «desde buscadores». */

const AT = new Date("2026-10-31T21:31:00Z");
const goal: WorkspaceGoal = { workspaceId: "w1", kind: "request", label: "Solicitud de presupuesto", eventName: "generate_lead", createdAt: AT, updatedAt: AT };

function capture(over: Partial<AnalyticsSnapshot> = {}): AnalyticsSnapshot {
  return {
    id: "a1",
    workspaceId: "w1",
    status: "completed",
    provider: "ga4",
    captureCondition: "owner_api",
    property: "properties/123",
    propertyName: "Olessium web",
    currentStart: "2026-10-01",
    currentEnd: "2026-10-28",
    previousStart: "2026-09-03",
    previousEnd: "2026-09-30",
    totals: { users: 10, sessions: 12, views: 30 },
    previousTotals: { users: 0, sessions: 0, views: 0 },
    channels: [],
    pages: [],
    quality: null,
    keyEvents: { version: 1, configured: ["generate_lead", "purchase"], configuredMore: false, total: 5, previousTotal: 0, organic: 2, previousOrganic: 0, organicByEvent: [{ event: "generate_lead", keyEvents: 2 }] },
    errorKind: null,
    errorMessage: null,
    accessibleProperties: null,
    propertiesSkipped: null,
    createdAt: AT,
    ...over,
  };
}

const none = { latest: null, latestCompleted: null };
const forbidden = /clientes|ventas|leads|customers|sales/i;

describe("summarizeGoal", () => {
  it("has nothing to say without a goal", () => {
    const v = summarizeGoal({ goal: null, analytics: none, evidence: null });
    expect(v).toMatchObject({ state: "none", status: { tone: "neutral", label: "Sin definir" }, text: "Objetivo comercial sin definir.", notes: [] });
  });

  it("is pending without any capture and says to connect GA4", () => {
    const v = summarizeGoal({ goal, analytics: none, evidence: null });
    expect(v.state).toBe("pending");
    expect(v.status).toEqual({ tone: "neutral", label: "Pendiente" });
    expect(v.text).toBe("Solicitud de presupuesto: pendiente de comprobar la medición. Google Analytics no ha registrado todavía ninguna recepción desde buscadores de este evento.");
    expect(v.notes).toEqual(["Conecta Google Analytics para comprobarlo."]);
    expect(v.count).toBeNull();
  });

  it("is pending with a capture that never saw the event, and warns when GA4 does not list it as key", () => {
    const c = capture({ keyEvents: { version: 1, configured: ["purchase"], configuredMore: false, total: 1, previousTotal: 0, organic: 0, previousOrganic: 0, organicByEvent: [] } });
    const v = summarizeGoal({ goal, analytics: { latest: c, latestCompleted: c }, evidence: null });
    expect(v.state).toBe("pending");
    expect(v.notes).toEqual(["El evento no está marcado como evento clave en Google Analytics."]);
    expect(v.count).toBe(0);
    const listed = summarizeGoal({ goal, analytics: { latest: capture(), latestCompleted: capture() }, evidence: null });
    expect(listed.notes).toEqual([]);
    // More key events than GA4 returned: the event may be among the hidden ones, so no warning.
    const more = capture({ keyEvents: { ...capture().keyEvents!, configured: ["purchase"], configuredMore: true } });
    expect(summarizeGoal({ goal, analytics: { latest: more, latestCompleted: more }, evidence: null }).notes).toEqual([]);
  });

  it("neither verifies nor counts from a capture without key events (before feature 008)", () => {
    const old = capture({ keyEvents: null });
    const v = summarizeGoal({ goal, analytics: { latest: old, latestCompleted: old }, evidence: null });
    expect(v).toMatchObject({ state: "pending", count: null, notes: [] });
  });

  it("is verified with evidence: the latest capture's organic count, zero included, and the last reception", () => {
    const c = capture();
    const v = summarizeGoal({ goal, analytics: { latest: c, latestCompleted: c }, evidence: { observedAt: AT } });
    expect(v.state).toBe("verified");
    expect(v.status).toEqual({ tone: "good", label: "Medido" });
    expect(v.count).toBe(2);
    expect(v.period).toEqual({ start: "2026-10-01", end: "2026-10-28" });
    expect(v.text).toBe("Solicitud de presupuesto: 2 desde buscadores en los últimos 28 días (Google Analytics, del 1 oct 2026 al 28 oct 2026).");
    expect(v.notes).toEqual(["Última recepción observada: 31 oct 2026, 22:31."]);
    expect(v.observedAt).toEqual(AT);

    const zeroNow = capture({ id: "a2", keyEvents: { ...c.keyEvents!, organic: 0, organicByEvent: [] } });
    const z = summarizeGoal({ goal, analytics: { latest: zeroNow, latestCompleted: zeroNow }, evidence: { observedAt: new Date("2026-10-02T10:00:00Z") } });
    expect(z.state).toBe("verified");
    expect(z.count).toBe(0);
    expect(z.text).toMatch(/^Solicitud de presupuesto: 0 desde buscadores/);
    expect(z.notes[0]).toBe("Última recepción observada: 2 oct 2026, 12:00.");

    const noKeyEvents = capture({ id: "a3", keyEvents: null });
    const n = summarizeGoal({ goal, analytics: { latest: noKeyEvents, latestCompleted: noKeyEvents }, evidence: { observedAt: AT } });
    expect(n.count).toBeNull();
    expect(n.text).toBe("Solicitud de presupuesto: medido desde buscadores en una lectura anterior; la última lectura no trae eventos clave.");
  });

  it("keeps a verified goal verified when GA4 stops listing the event as key, and says so", () => {
    const c = capture({ keyEvents: { ...capture().keyEvents!, configured: ["purchase"], organicByEvent: [] } });
    const v = summarizeGoal({ goal, analytics: { latest: c, latestCompleted: c }, evidence: { observedAt: AT } });
    expect(v.state).toBe("verified");
    expect(v.count).toBe(0);
    expect(v.notes).toEqual(["Última recepción observada: 31 oct 2026, 22:31.", "El evento no está marcado como evento clave en Google Analytics."]);
  });

  it("never calls them customers, sales or leads, in either language", () => {
    const c = capture();
    const cases = [
      summarizeGoal({ goal, analytics: none, evidence: null }),
      summarizeGoal({ goal, analytics: { latest: c, latestCompleted: c }, evidence: { observedAt: AT } }),
      summarizeGoal({ goal, analytics: none, evidence: null }, "en"),
      summarizeGoal({ goal, analytics: { latest: c, latestCompleted: c }, evidence: { observedAt: AT } }, "en"),
    ];
    for (const v of cases) expect([v.text, ...v.notes].join(" ")).not.toMatch(forbidden);
    expect(cases[3]!.text).toBe("Solicitud de presupuesto: 2 from search engines in the last 28 days (Google Analytics, from 1 Oct 2026 to 28 Oct 2026).");
    expect(cases[2]!.notes).toEqual(["Connect Google Analytics to verify it."]);
    expect(summarizeGoal({ goal: { ...goal, kind: "other" }, analytics: none, evidence: null }, "en")).toMatchObject({ kindLabel: "Other", status: { label: "Pending" } });
  });
});
