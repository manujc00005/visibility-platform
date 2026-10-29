import { describe, expect, it, vi } from "vitest";
import { analyticsConfigFor, createAnalyticsDeps } from "@/modules/analytics/deps";
import { serviceAccountJson } from "../search-console/fixtures";

const SITE = { domain: "olessium.com", hostname: "olessium.com" };

describe("analyticsConfigFor", () => {
  it("tells apart missing, invalid and ready credentials, showing only the service account email", () => {
    expect(analyticsConfigFor(undefined)).toEqual({ state: "not_configured" });
    expect(analyticsConfigFor("{not json")).toEqual({ state: "invalid", reason: "not_json" });
    expect(analyticsConfigFor(serviceAccountJson({ type: "user" }))).toEqual({ state: "invalid", reason: "not_service_account" });
    expect(analyticsConfigFor(serviceAccountJson())).toEqual({ state: "ready", clientEmail: "visibility@demo.iam.gserviceaccount.com" });
  });
});

describe("createAnalyticsDeps", () => {
  it("makes no request without a usable credential (D007)", () => {
    const fetchImpl = vi.fn();
    for (const raw of [undefined, "", "{not json", serviceAccountJson({ private_key: "nope" })]) {
      expect(createAnalyticsDeps(() => raw, { fetchImpl: fetchImpl as unknown as typeof fetch }).collect(SITE)).toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("collects with a valid credential", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "invalid_grant" }), { status: 400 }));
    const outcome = await createAnalyticsDeps(() => serviceAccountJson(), { fetchImpl: fetchImpl as unknown as typeof fetch }).collect(SITE);
    expect(outcome).toMatchObject({ ok: false, kind: "invalid_credentials" });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
