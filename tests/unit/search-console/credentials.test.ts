import { describe, expect, it } from "vitest";
import { parseServiceAccount } from "@/modules/search-console/credentials";
import { PRIVATE_PEM, serviceAccountJson } from "./fixtures";

describe("parseServiceAccount", () => {
  it("returns null when nothing is configured", () => {
    expect(parseServiceAccount(undefined)).toBeNull();
    expect(parseServiceAccount("")).toBeNull();
  });

  it("reads raw JSON and keeps only email, key id and key", () => {
    const parsed = parseServiceAccount(serviceAccountJson());
    expect(parsed?.ok).toBe(true);
    if (!parsed?.ok) return;
    expect(parsed.value.clientEmail).toBe("visibility@demo.iam.gserviceaccount.com");
    expect(parsed.value.privateKeyId).toBe("kid-1");
    expect(parsed.value.privateKey.type).toBe("private");
    // token_uri from the file is never kept.
    expect(Object.keys(parsed.value)).toEqual(["clientEmail", "privateKeyId", "privateKey"]);
  });

  it("reads base64 of the JSON", () => {
    const parsed = parseServiceAccount(Buffer.from(serviceAccountJson()).toString("base64"));
    expect(parsed?.ok).toBe(true);
  });

  it("rejects malformed values without echoing them", () => {
    const cases = [
      "not json at all {",
      serviceAccountJson({ type: "authorized_user" }),
      serviceAccountJson({ client_email: "nope" }),
      serviceAccountJson({ private_key: "-----BEGIN PRIVATE KEY-----\ngarbage\n-----END PRIVATE KEY-----" }),
    ];
    for (const raw of cases) {
      const parsed = parseServiceAccount(raw);
      expect(parsed?.ok).toBe(false);
      if (parsed && !parsed.ok) {
        expect(parsed.reason).not.toContain("PRIVATE KEY");
        expect(parsed.reason).not.toContain(PRIVATE_PEM.slice(40, 80));
      }
    }
  });
});
