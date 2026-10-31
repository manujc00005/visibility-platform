import { describe, expect, it, vi } from "vitest";
import type { Database } from "@/db/client";
import { proposeBusinessProfile } from "@/modules/geo/competitors/profile-service";
import { fakeFetcher } from "../../../support/fake-fetcher";

vi.mock("@/modules/geo/competitors/profile", async (original) => ({
  ...(await original<typeof import("@/modules/geo/competitors/profile")>()),
  proposeProfile: () => {
    throw new RangeError("Maximum call stack size exceeded");
  },
}));
vi.mock("@/modules/workspaces/service", () => ({
  getWorkspace: async () => ({ domain: "empresa.es", hostname: "empresa.es", city: null, services: [] }),
}));

describe("proposeBusinessProfile", () => {
  it("a page that breaks the parser reads as unreadable, so the form keeps what was typed (FR-005)", async () => {
    const fetcher = fakeFetcher({ "https://empresa.es/": { status: 200, contentType: "text/html", body: "<div>" } });
    expect(await proposeBusinessProfile({} as Database, "00000000-0000-4000-8000-000000000001", { fetcher })).toEqual({ ok: false, error: "unreadable" });
  });
});
