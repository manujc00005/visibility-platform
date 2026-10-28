import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { formatTimestamp } from "@/i18n/format";
import { getMessages } from "@/i18n/messages";

// The system status card printed `Comprobado ${toLocaleString("es-ES")}` and `Conectada (${latencyMs} ms)`
// before 003; Spanish must stay identical (D007, D020).
describe("system status card texts", () => {
  const checked = new Date("2026-10-27T12:34:56Z");
  // The card uses the runtime time zone; fix it so the literals below pin the format.
  const previousTz = process.env.TZ;
  beforeAll(() => {
    process.env.TZ = "UTC";
  });
  afterAll(() => {
    process.env.TZ = previousTz;
  });

  it("keeps the original Spanish date and raw latency", () => {
    const t = getMessages("es").home.systemStatus;
    expect(t.checkedAt(formatTimestamp(checked, "es"))).toBe("Comprobado 27/10/2026, 12:34:56");
    expect(t.connected(12)).toBe("Conectada (12 ms)");
    expect(t.connected(1234)).toBe("Conectada (1234 ms)");
  });

  it("uses the same shape in English", () => {
    const t = getMessages("en").home.systemStatus;
    expect(t.checkedAt(formatTimestamp(checked, "en"))).toBe("Checked 27/10/2026, 12:34:56");
    expect(t.connected(1234)).toBe("Connected (1234 ms)");
  });
});
