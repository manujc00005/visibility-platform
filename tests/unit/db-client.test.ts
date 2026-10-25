import { describe, expect, it } from "vitest";
import { withVerifiedSsl } from "@/db/client";

describe("withVerifiedSsl", () => {
  it("pins verify-full for Neon's sslmode=require, keeping other params", () => {
    expect(
      withVerifiedSsl("postgresql://u:p@ep-x-pooler.aws.neon.tech/neondb?sslmode=require&channel_binding=require"),
    ).toBe("postgresql://u:p@ep-x-pooler.aws.neon.tech/neondb?sslmode=verify-full&channel_binding=require");
  });

  it("upgrades prefer and verify-ca too", () => {
    expect(withVerifiedSsl("postgres://h/db?a=1&sslmode=prefer")).toBe("postgres://h/db?a=1&sslmode=verify-full");
    expect(withVerifiedSsl("postgres://h/db?sslmode=verify-ca")).toBe("postgres://h/db?sslmode=verify-full");
  });

  it("leaves URLs without sslmode (local Postgres) and disable untouched", () => {
    expect(withVerifiedSsl("postgresql://u:p@127.0.0.1:5433/db")).toBe("postgresql://u:p@127.0.0.1:5433/db");
    expect(withVerifiedSsl("postgres://h/db?sslmode=disable")).toBe("postgres://h/db?sslmode=disable");
  });
});
