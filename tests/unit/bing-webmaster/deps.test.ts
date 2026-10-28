import { describe, expect, it, vi } from "vitest";
import { bingWebmasterConfigFor, createBingWebmasterDeps } from "@/modules/bing-webmaster/deps";

const KEY = "EEDECC1EA4AE341CC57365E075EBC8B6";
const SITE = { domain: "olessium.com", hostname: "olessium.com" };

describe("bingWebmasterConfigFor", () => {
  it("tells apart missing, invalid and ready keys without carrying the value", () => {
    expect(bingWebmasterConfigFor(undefined)).toEqual({ state: "not_configured" });
    expect(bingWebmasterConfigFor(`${KEY}&x=1`)).toEqual({ state: "invalid", reason: "bad_format" });
    expect(bingWebmasterConfigFor(KEY)).toEqual({ state: "ready" });
  });
});

describe("createBingWebmasterDeps", () => {
  it("makes no request without a usable key", () => {
    const fetchImpl = vi.fn();
    for (const raw of [undefined, "", "bad key!"]) {
      expect(createBingWebmasterDeps(() => raw, { fetchImpl: fetchImpl as unknown as typeof fetch }).collect(SITE)).toBeNull();
    }
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  it("collects with a valid key", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ d: [] }), { status: 200 }));
    const outcome = await createBingWebmasterDeps(() => ` ${KEY} `, { fetchImpl: fetchImpl as unknown as typeof fetch }).collect(SITE);
    expect(outcome).toMatchObject({ ok: false, kind: "no_access", verifiedSites: 0 });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
  });
});
