import { describe, expect, it } from "vitest";
import type { AnalyticsConfig } from "@/modules/analytics/deps";
import type { AnalyticsSnapshot } from "@/modules/analytics/schema";
import { summarizeAnalytics } from "@/modules/analytics/summary";

const EMAIL = "gsc-reader@olessium.iam.gserviceaccount.com";
const READY: AnalyticsConfig = { state: "ready", clientEmail: EMAIL };
const at = (iso: string) => new Date(iso);
const ZERO = { users: 0, sessions: 0, views: 0 };

function completed(overrides: Partial<AnalyticsSnapshot> = {}): AnalyticsSnapshot {
  return {
    id: "s1",
    workspaceId: "w1",
    status: "completed",
    provider: "ga4",
    captureCondition: "owner_api",
    property: "properties/123",
    propertyName: "Olessium",
    currentStart: "2026-09-29",
    currentEnd: "2026-10-26",
    previousStart: "2026-09-01",
    previousEnd: "2026-09-28",
    totals: { users: 80, sessions: 120, views: 300 },
    previousTotals: { users: 80, sessions: 100, views: 400 },
    channels: [
      { channel: "Organic Search", sessions: 70, previousSessions: 50 },
      { channel: "Referral", sessions: 0, previousSessions: 50 },
    ],
    pages: [{ page: "/es/tienda", views: 1200, users: 30 }],
    quality: { otherRow: false, thresholded: false, sampled: false },
    errorKind: null,
    errorMessage: null,
    accessibleProperties: null,
    propertiesSkipped: null,
    createdAt: at("2026-10-28T10:00:00Z"),
    ...overrides,
  };
}

function failed(kind: NonNullable<AnalyticsSnapshot["errorKind"]>, overrides: Partial<AnalyticsSnapshot> = {}): AnalyticsSnapshot {
  return completed({
    id: "f1",
    status: "failed",
    property: null,
    propertyName: null,
    currentStart: null,
    currentEnd: null,
    previousStart: null,
    previousEnd: null,
    totals: null,
    previousTotals: null,
    channels: [],
    pages: [],
    quality: null,
    errorKind: kind,
    errorMessage: "diagnóstico",
    createdAt: at("2026-10-28T12:00:00Z"),
    ...overrides,
  });
}

const none = { latest: null, latestCompleted: null };
const both = (s: AnalyticsSnapshot) => ({ latest: s, latestCompleted: s });

describe("summarizeAnalytics", () => {
  it("shows figures, Spanish changes, channels, pages, property and both periods", () => {
    const s = summarizeAnalytics(both(completed()), READY, "olessium.com");
    expect(s.state).toBe("ok");
    expect(s.property).toBe("properties/123");
    expect(s.propertyName).toBe("Olessium");
    expect(s.period).toEqual({ start: "2026-09-29", end: "2026-10-26" });
    expect(s.previousPeriod).toEqual({ start: "2026-09-01", end: "2026-09-28" });
    expect(s.metrics).toEqual({
      users: { value: "80", previous: "80", change: { direction: "same", text: "Antes: 80 usuarios (sin cambio apreciable)" } },
      sessions: { value: "120", previous: "100", change: { direction: "better", text: "Antes: 100 sesiones (+20 %)" } },
      views: { value: "300", previous: "400", change: { direction: "worse", text: "Antes: 400 páginas vistas (-25 %)" } },
    });
    expect(s.channels).toEqual([
      { channel: "Organic Search", sessions: "70", change: { direction: "better", text: "Antes: 50 sesiones (+40 %)" } },
      { channel: "Referral", sessions: "0", change: { direction: "worse", text: "Antes: 50 sesiones (-100 %)" } },
    ]);
    expect(s.pages).toEqual([{ page: "/es/tienda", views: "1200", users: "30" }]);
    expect(s.quality).toBeNull();
    expect(s.configWarning).toBeNull();
  });

  it("speaks English when asked", () => {
    const s = summarizeAnalytics(both(completed()), READY, "olessium.com", "en");
    expect(s.metrics?.sessions.change?.text).toBe("Before: 100 sessions (+20%)");
  });

  it("hides changes when the previous period had no sessions", () => {
    const s = summarizeAnalytics(both(completed({ previousTotals: ZERO })), READY, "olessium.com");
    expect(s.metrics?.users).toEqual({ value: "80", previous: null, change: null });
    expect(s.channels[0]!.change).toBeNull();
  });

  it("says there are no visits, without error tone, when both periods are zero", () => {
    const s = summarizeAnalytics(both(completed({ totals: ZERO, previousTotals: ZERO, channels: [], pages: [] })), READY, "olessium.com");
    expect(s.state).toBe("empty");
    expect(s.reason).toMatch(/^Google Analytics no tiene visitas de esta web en estos 56 días\. Comprueba que la etiqueta/);
    expect(s.metrics).toBeNull();
  });

  it("explains quality notices in one sentence", () => {
    const s = summarizeAnalytics(both(completed({ quality: { otherRow: true, thresholded: true, sampled: false } })), READY, "olessium.com");
    expect(s.quality).toBe("Aviso de Google Analytics: agrupó parte de los datos en «(other)»; ocultó algunas filas con pocos usuarios para proteger su privacidad.");
  });

  it("keeps stored data with a warning when the credential is later missing or broken (D007)", () => {
    const missing = summarizeAnalytics(both(completed()), { state: "not_configured" }, "olessium.com");
    expect(missing.state).toBe("ok");
    expect(missing.configWarning).toBe("Google Analytics no está configurado en la plataforma. Se muestran los datos de la última consulta guardada.");
    const broken = summarizeAnalytics(both(completed()), { state: "invalid", reason: "not_json" }, "olessium.com");
    expect(broken.configWarning).toBe("GSC_SERVICE_ACCOUNT_JSON no es un JSON válido, ni en crudo ni en base64. Se muestran los datos de la última consulta guardada.");
  });

  it("keeps the last good capture visible next to a later failure", () => {
    const s = summarizeAnalytics({ latest: failed("quota_exceeded"), latestCompleted: completed() }, READY, "olessium.com");
    expect(s.state).toBe("ok");
    expect(s.lastFailure).toEqual({ text: "La cuota de la API de Google Analytics está agotada. Vuelve a intentarlo más tarde.", at: at("2026-10-28T12:00:00Z") });
  });

  it("explains each failure from its kind, with the service account email when nothing matched", () => {
    const text = (s: AnalyticsSnapshot, config: AnalyticsConfig = READY) => summarizeAnalytics({ latest: s, latestCompleted: null }, config, "olessium.com").reason;
    expect(text(failed("no_access", { accessibleProperties: 3, propertiesSkipped: false }))).toBe(
      `${EMAIL} no ve ninguna propiedad de Google Analytics con la web olessium.com. Añádela con el rol Lector en Administrar › Gestión de acceso a la propiedad y vuelve a intentarlo. Ahora mismo ve 3 propiedades.`,
    );
    expect(text(failed("no_access", { accessibleProperties: 25, propertiesSkipped: true }))).toMatch(/Ahora mismo ve 25 propiedades\. Solo se revisan las 20 primeras\.$/);
    expect(text(failed("no_access"))).toMatch(/^La cuenta de servicio no tiene permiso para leer esta propiedad/);
    expect(text(failed("admin_api_disabled"))).toMatch(/^La Google Analytics Admin API no está activada/);
    expect(text(failed("data_api_disabled"))).toMatch(/^La Google Analytics Data API no está activada/);
    expect(text(failed("invalid_credentials"))).toMatch(/^Google rechazó la clave/);
    expect(text(failed("error"))).toBe("No se pudieron leer los datos de Google Analytics. Vuelve a intentarlo.");
    expect(summarizeAnalytics({ latest: failed("error"), latestCompleted: null }, READY, "olessium.com").state).toBe("error");
  });

  it("covers the states without a good capture", () => {
    expect(summarizeAnalytics(none, { state: "not_configured" }, "olessium.com")).toMatchObject({ state: "not_configured", reason: "Google Analytics no está configurado en la plataforma." });
    expect(summarizeAnalytics(none, { state: "invalid", reason: "unreadable_key" }, "olessium.com")).toMatchObject({
      state: "invalid_config",
      reason: "La clave privada de GSC_SERVICE_ACCOUNT_JSON no se puede leer.",
    });
    expect(summarizeAnalytics(none, READY, "olessium.com")).toMatchObject({ state: "no_data", reason: "Pulsa «Traer datos de Analytics» para ver cuánta gente visita tu web." });
  });
});
