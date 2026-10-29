import { createVerify } from "node:crypto";
import { describe, expect, it } from "vitest";
import { parseServiceAccount, type ServiceAccount } from "@/modules/search-console/credentials";
import { fetchAccessToken, GscError, listSites, querySearchAnalytics, signJwt, TOKEN_ENDPOINT } from "@/modules/search-console/google";
import { keys, scripted, serviceAccountJson } from "./fixtures";

const account = (() => {
  const parsed = parseServiceAccount(serviceAccountJson());
  if (!parsed?.ok) throw new Error("fixture");
  return parsed.value;
})() satisfies ServiceAccount;

const decode = (part: string) => JSON.parse(Buffer.from(part, "base64url").toString("utf8"));

async function caught(promise: Promise<unknown>): Promise<GscError> {
  try {
    await promise;
  } catch (error) {
    if (error instanceof GscError) return error;
    throw error;
  }
  throw new Error("expected a GscError");
}

describe("signJwt", () => {
  it("signs an RS256 JWT for the fixed token endpoint with a one-hour lifetime", () => {
    const jwt = signJwt(account, 1_800_000_000);
    const [header, claims, signature] = jwt.split(".");
    expect(decode(header!)).toEqual({ alg: "RS256", typ: "JWT", kid: "kid-1" });
    expect(decode(claims!)).toEqual({
      iss: "visibility@demo.iam.gserviceaccount.com",
      scope: "https://www.googleapis.com/auth/webmasters.readonly",
      aud: "https://oauth2.googleapis.com/token",
      iat: 1_800_000_000,
      exp: 1_800_003_600,
    });
    const valid = createVerify("RSA-SHA256").update(`${header}.${claims}`).verify(keys.publicKey, signature!, "base64url");
    expect(valid).toBe(true);
  });

  it("signs for another Google API when asked (feature 006, D004)", () => {
    const [, claims] = signJwt(account, 1, "https://www.googleapis.com/auth/analytics.readonly").split(".");
    expect(decode(claims!).scope).toBe("https://www.googleapis.com/auth/analytics.readonly");
  });
});

describe("fetchAccessToken", () => {
  it("posts the jwt-bearer grant to Google's endpoint, not the file's token_uri", async () => {
    const { calls, impl } = scripted([{ match: (u) => u === TOKEN_ENDPOINT, status: 200, body: { access_token: "ya29.t", expires_in: 3600 } }]);
    await expect(fetchAccessToken(account, { fetchImpl: impl, nowSeconds: 1 })).resolves.toBe("ya29.t");
    expect(calls).toHaveLength(1);
    const form = new URLSearchParams(calls[0]!.body);
    expect(form.get("grant_type")).toBe("urn:ietf:params:oauth:grant-type:jwt-bearer");
    expect(form.get("assertion")?.split(".")).toHaveLength(3);
    expect(decode(form.get("assertion")!.split(".")[1]!).scope).toBe("https://www.googleapis.com/auth/webmasters.readonly");
  });

  it("asks for the requested scope", async () => {
    const { calls, impl } = scripted([{ match: (u) => u === TOKEN_ENDPOINT, status: 200, body: { access_token: "ya29.t" } }]);
    await fetchAccessToken(account, { fetchImpl: impl, scope: "https://www.googleapis.com/auth/analytics.readonly" });
    const assertion = new URLSearchParams(calls[0]!.body).get("assertion")!;
    expect(decode(assertion.split(".")[1]!).scope).toBe("https://www.googleapis.com/auth/analytics.readonly");
  });

  it("maps a rejected key to invalid_credentials", async () => {
    const { impl } = scripted([{ match: () => true, status: 400, body: { error: "invalid_grant" } }]);
    const error = await caught(fetchAccessToken(account, { fetchImpl: impl }));
    expect(error.kind).toBe("invalid_credentials");
  });

  it("maps network failures and timeouts to error with a readable message", async () => {
    const impl = (async () => {
      throw Object.assign(new Error("t"), { name: "TimeoutError" });
    }) as typeof fetch;
    const error = await caught(fetchAccessToken(account, { fetchImpl: impl }));
    expect(error.kind).toBe("error");
    expect(error.message).toMatch(/no respondió a tiempo/);
  });
});

describe("Search Console API", () => {
  it("lists sites with the bearer token", async () => {
    const { calls, impl } = scripted([
      { match: (u) => u.endsWith("/sites"), status: 200, body: { siteEntry: [{ siteUrl: "sc-domain:e.es", permissionLevel: "siteOwner" }] } },
    ]);
    await expect(listSites("tok", { fetchImpl: impl })).resolves.toEqual([{ siteUrl: "sc-domain:e.es", permissionLevel: "siteOwner" }]);
    expect(calls[0]!.headers.authorization).toBe("Bearer tok");
  });

  it("returns no sites when the account has none", async () => {
    const { impl } = scripted([{ match: () => true, status: 200, body: {} }]);
    await expect(listSites("tok", { fetchImpl: impl })).resolves.toEqual([]);
  });

  it("encodes the property in the path and asks for final web data", async () => {
    const { calls, impl } = scripted([
      { match: (u) => u.includes("/searchAnalytics/query"), status: 200, body: { rows: [{ keys: ["dentista"], clicks: 3, impressions: 40, ctr: 0.075, position: 7.2 }] } },
    ]);
    const rows = await querySearchAnalytics("tok", "sc-domain:e.es", { startDate: "2026-09-27", endDate: "2026-10-24", dimensions: ["query"], rowLimit: 25 }, { fetchImpl: impl });
    expect(rows).toEqual([{ keys: ["dentista"], clicks: 3, impressions: 40, ctr: 0.075, position: 7.2 }]);
    expect(calls[0]!.url).toBe("https://www.googleapis.com/webmasters/v3/sites/sc-domain%3Ae.es/searchAnalytics/query");
    expect(JSON.parse(calls[0]!.body)).toMatchObject({ type: "web", dataState: "final", rowLimit: 25, dimensions: ["query"] });
  });

  it("rejects impossible numbers instead of storing them", async () => {
    const { impl } = scripted([{ match: () => true, status: 200, body: { rows: [{ keys: ["x"], clicks: -1, impressions: 1, ctr: 0, position: 1 }] } }]);
    const error = await caught(querySearchAnalytics("tok", "sc-domain:e.es", { startDate: "a", endDate: "b", dimensions: [], rowLimit: 1 }, { fetchImpl: impl }));
    expect(error.kind).toBe("error");
  });

  it.each([
    [401, {}, "invalid_credentials"],
    [403, { error: { message: "Google Search Console API has not been used in project 1 before or it is disabled." } }, "api_disabled"],
    [403, { error: { details: [{ reason: "SERVICE_DISABLED" }] } }, "api_disabled"],
    [403, { error: { message: "User does not have sufficient permission for site 'sc-domain:e.es'." } }, "no_access"],
    [429, {}, "quota_exceeded"],
    [500, {}, "error"],
  ])("maps HTTP %i to %s", async (status, body, kind) => {
    const { impl } = scripted([{ match: () => true, status, body }]);
    const error = await caught(listSites("tok", { fetchImpl: impl }));
    expect(error.kind).toBe(kind);
    expect(error.message).not.toContain("tok");
  });
});
