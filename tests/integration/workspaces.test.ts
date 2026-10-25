import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { workspaces } from "@/db/schema";
import {
  createWorkspace,
  getWorkspace,
  listWorkspaces,
  updateWorkspace,
} from "@/modules/workspaces/service";
import { createTestDb } from "./db";

const { pool, db } = createTestDb();
afterAll(() => pool.end());
beforeEach(async () => {
  await db.delete(workspaces);
});

const input = (overrides: Record<string, unknown> = {}) => ({
  name: "Clínica Dental García",
  website: "https://www.clinicagarcia.es/contacto",
  sector: "Clínica dental",
  country: "ES",
  city: "Valladolid",
  services: "Implantes\nOrtodoncia",
  ...overrides,
});

async function created(overrides: Record<string, unknown> = {}) {
  const result = await createWorkspace(db, input(overrides));
  if (!result.ok) throw new Error(`create failed: ${JSON.stringify(result.error)}`);
  return result.workspace;
}

describe("createWorkspace", () => {
  it("persists normalized data with a stable UUID and timestamps", async () => {
    const workspace = await created();
    expect(workspace.id).toMatch(/^[0-9a-f-]{36}$/);
    expect(workspace).toMatchObject({
      name: "Clínica Dental García",
      domain: "clinicagarcia.es",
      hostname: "www.clinicagarcia.es",
      originalUrl: "https://www.clinicagarcia.es/contacto",
      sector: "Clínica dental",
      country: "ES",
      city: "Valladolid",
      services: ["Implantes", "Ortodoncia"],
    });
    expect(workspace.createdAt).toBeInstanceOf(Date);
    expect(workspace.updatedAt.getTime()).toBe(workspace.createdAt.getTime());
  });

  it("rejects a duplicate domain written differently and points to the existing workspace", async () => {
    const first = await created();
    const result = await createWorkspace(db, input({ name: "Otra", website: "CLINICAGARCIA.ES" }));
    expect(result).toEqual({
      ok: false,
      error: { kind: "duplicate_domain", domain: "clinicagarcia.es", existingId: first.id },
    });
    expect(await listWorkspaces(db)).toHaveLength(1);
  });

  it("creates exactly one row when the same domain is submitted concurrently", async () => {
    const attempts = await Promise.all(
      Array.from({ length: 5 }, (_, i) => createWorkspace(db, input({ name: `Intento ${i}` }))),
    );
    expect(attempts.filter((r) => r.ok)).toHaveLength(1);
    const failures = attempts.filter((r) => !r.ok);
    expect(failures).toHaveLength(4);
    for (const failure of failures) expect(!failure.ok && failure.error.kind).toBe("duplicate_domain");
    expect(await listWorkspaces(db)).toHaveLength(1);
  });

  it("returns field errors and writes nothing for invalid input", async () => {
    const result = await createWorkspace(db, input({ website: "http://10.0.0.1", services: "" }));
    expect(result.ok).toBe(false);
    expect(!result.ok && result.error.kind === "validation" && Object.keys(result.error.fieldErrors).sort()).toEqual([
      "services",
      "website",
    ]);
    expect(await listWorkspaces(db)).toHaveLength(0);
  });
});

describe("getWorkspace and listWorkspaces", () => {
  it("returns a workspace by id and null for unknown or malformed ids", async () => {
    const workspace = await created();
    expect((await getWorkspace(db, workspace.id))?.domain).toBe("clinicagarcia.es");
    expect(await getWorkspace(db, "00000000-0000-4000-8000-000000000000")).toBeNull();
    expect(await getWorkspace(db, "no-es-un-uuid")).toBeNull();
    expect(await getWorkspace(db, "1; drop table workspaces")).toBeNull();
  });

  it("lists newest first", async () => {
    await created({ website: "primera.es" });
    await created({ website: "segunda.es" });
    expect((await listWorkspaces(db)).map((w) => w.domain)).toEqual(["segunda.es", "primera.es"]);
  });
});

describe("updateWorkspace", () => {
  it("updates fields, re-normalizes the domain and bumps updatedAt only", async () => {
    const original = await created();
    const result = await updateWorkspace(
      db,
      original.id,
      input({ name: "Clínica García", website: "garcia-dental.es", city: "", services: ["Implantes"] }),
    );
    expect(result.ok).toBe(true);
    if (!result.ok) return;
    expect(result.workspace).toMatchObject({
      id: original.id,
      name: "Clínica García",
      domain: "garcia-dental.es",
      hostname: "garcia-dental.es",
      city: null,
      services: ["Implantes"],
    });
    expect(result.workspace.createdAt.getTime()).toBe(original.createdAt.getTime());
    expect(result.workspace.updatedAt.getTime()).toBeGreaterThanOrEqual(original.updatedAt.getTime());
  });

  it("leaves the stored row untouched when the edit is invalid", async () => {
    const original = await created();
    const result = await updateWorkspace(db, original.id, input({ name: "", website: "localhost" }));
    expect(result.ok).toBe(false);
    expect(await getWorkspace(db, original.id)).toEqual(original);
  });

  it("rejects changing to another workspace's domain without modifying either", async () => {
    const a = await created({ website: "a-empresa.es" });
    const b = await created({ website: "b-empresa.es", name: "B" });
    const result = await updateWorkspace(db, b.id, input({ name: "B renombrada", website: "www.a-empresa.es" }));
    expect(result).toEqual({ ok: false, error: { kind: "duplicate_domain", domain: "a-empresa.es", existingId: a.id } });
    expect(await getWorkspace(db, b.id)).toEqual(b);
    expect(await getWorkspace(db, a.id)).toEqual(a);
  });

  it("returns not_found for unknown or malformed ids", async () => {
    expect(await updateWorkspace(db, "00000000-0000-4000-8000-000000000000", input())).toEqual({
      ok: false,
      error: { kind: "not_found" },
    });
    expect(await updateWorkspace(db, "abc", input())).toEqual({ ok: false, error: { kind: "not_found" } });
  });
});

describe("database constraints (defence in depth)", () => {
  it("refuses a non-normalized domain inserted bypassing the service", async () => {
    await expect(
      db.insert(workspaces).values({
        name: "X",
        domain: "WWW.Ejemplo.es",
        hostname: "www.ejemplo.es",
        originalUrl: "x",
        sector: "x",
        country: "ES",
        services: ["x"],
      }),
    ).rejects.toThrow();
  });
});
