import { eq, sql } from "drizzle-orm";
import { afterAll, beforeEach, describe, expect, it } from "vitest";
import { analyticsSnapshots, workspaceGoals, workspaces } from "@/db/schema";
import type { KeyEvents } from "@/modules/analytics/collect";
import { getGoal, goalEvidence, removeGoal, saveGoal } from "@/modules/goals/service";
import { createWorkspace } from "@/modules/workspaces/service";
import { createTestDb } from "./db";

/** The commercial goal (feature 016): one row per company, verified only from the GA4 captures (D002). */

const { pool, db } = createTestDb();
afterAll(() => pool.end());
beforeEach(async () => {
  await db.delete(workspaces);
});

async function workspace(website = "https://www.empresa.es/") {
  const ws = await createWorkspace(db, { name: "Empresa", website, sector: "Agencia", country: "ES", services: "CRM" });
  if (!ws.ok) throw new Error("workspace");
  return ws.workspace.id;
}

const input = { kind: "request", label: "Solicitud de presupuesto", eventName: " generate_lead " };

function keyEvents(organicByEvent: { event: string; keyEvents: number }[]): KeyEvents {
  return { version: 1, configured: ["generate_lead", "purchase"], configuredMore: false, total: 5, previousTotal: 0, organic: organicByEvent.reduce((n, e) => n + e.keyEvents, 0), previousOrganic: 0, organicByEvent };
}

async function capture(workspaceId: string, over: { keyEvents?: KeyEvents | null; status?: "completed" | "failed"; createdAt?: Date; currentEnd?: string | null } = {}) {
  const status = over.status ?? "completed";
  const [row] = await db
    .insert(analyticsSnapshots)
    .values(
      status === "completed"
        ? {
            workspaceId,
            status,
            property: "properties/123",
            propertyName: "Web",
            currentStart: "2026-10-01",
            currentEnd: over.currentEnd === undefined ? "2026-10-28" : over.currentEnd,
            previousStart: "2026-09-03",
            previousEnd: "2026-09-30",
            totals: { users: 1, sessions: 1, views: 1 },
            previousTotals: { users: 0, sessions: 0, views: 0 },
            quality: { otherRow: false, thresholded: false, sampled: false },
            keyEvents: over.keyEvents === undefined ? keyEvents([{ event: "generate_lead", keyEvents: 2 }]) : over.keyEvents,
            createdAt: over.createdAt,
          }
        : { workspaceId, status, errorKind: "error", errorMessage: "x", createdAt: over.createdAt },
    )
    .returning();
  return row!;
}

describe("saving the goal (AC-001, AC-002)", () => {
  it("creates one row, trims the event, updates in place, writes nothing when invalid and removes idempotently", async () => {
    const id = await workspace();
    const first = await saveGoal(db, id, input);
    if (!first.ok) throw new Error(first.error);
    expect(first.value).toMatchObject({ workspaceId: id, kind: "request", label: "Solicitud de presupuesto", eventName: "generate_lead" });
    const second = await saveGoal(db, id, { ...input, kind: "booking", label: "Reserva de cita" });
    if (!second.ok) throw new Error(second.error);
    expect(second.value.createdAt).toEqual(first.value.createdAt);
    expect(await db.select().from(workspaceGoals)).toHaveLength(1);
    expect((await getGoal(db, id))?.label).toBe("Reserva de cita");
    expect(await saveGoal(db, id, { ...input, label: "" })).toMatchObject({ ok: false, error: "validation", fieldErrors: { label: ["Indica el nombre del objetivo."] } });
    expect(await saveGoal(db, id, { ...input, kind: "lead" }, "en")).toMatchObject({ ok: false, error: "validation", fieldErrors: { kind: ["Invalid kind of result."] } });
    expect(await saveGoal(db, id, { ...input, eventName: "x".repeat(201) })).toMatchObject({ ok: false, error: "validation" });
    expect((await getGoal(db, id))?.label).toBe("Reserva de cita");
    expect(await removeGoal(db, id)).toBe(true);
    expect(await removeGoal(db, id)).toBe(false);
    expect(await getGoal(db, id)).toBeNull();
  });

  it("answers not_found for an unknown company and cascades with the company", async () => {
    expect(await saveGoal(db, "00000000-0000-4000-8000-000000000000", input)).toMatchObject({ ok: false, error: "not_found" });
    expect(await getGoal(db, "nope")).toBeNull();
    const id = await workspace();
    await saveGoal(db, id, input);
    await db.delete(workspaces).where(eq(workspaces.id, id));
    expect(await db.select().from(workspaceGoals)).toHaveLength(0);
  });

  it.each([
    ["workspace_goals_kind_valid", { kind: "lead" }],
    ["workspace_goals_label_length", { label: "" }],
    ["workspace_goals_label_length", { label: "x".repeat(81) }],
    ["workspace_goals_event_length", { eventName: "" }],
    ["workspace_goals_event_length", { eventName: " padded" }],
  ])("the database refuses %s", async (constraint, over) => {
    const id = await workspace();
    const row = { workspaceId: id, kind: "request", label: "Solicitud", eventName: "generate_lead", ...over };
    await expect(db.insert(workspaceGoals).values(row as typeof workspaceGoals.$inferInsert)).rejects.toMatchObject({ cause: { constraint } });
  });
});

describe("goal evidence (AC-003)", () => {
  it("returns the most recent good capture with the event above zero, and nothing otherwise", async () => {
    const id = await workspace();
    expect(await goalEvidence(db, id, "generate_lead")).toBeNull();
    await capture(id, { keyEvents: keyEvents([{ event: "generate_lead", keyEvents: 0 }]), createdAt: new Date("2026-10-01T10:00:00Z") });
    expect(await goalEvidence(db, id, "generate_lead")).toBeNull();
    const seen = await capture(id, { createdAt: new Date("2026-10-10T10:00:00Z") });
    const later = await capture(id, { keyEvents: keyEvents([{ event: "generate_lead", keyEvents: 1 }]), createdAt: new Date("2026-10-20T10:00:00Z") });
    await capture(id, { keyEvents: keyEvents([{ event: "purchase", keyEvents: 3 }]), createdAt: new Date("2026-10-25T10:00:00Z") });
    await capture(id, { keyEvents: null, createdAt: new Date("2026-10-26T10:00:00Z") });
    await capture(id, { status: "failed", createdAt: new Date("2026-10-27T10:00:00Z") });
    expect(await goalEvidence(db, id, "generate_lead")).toEqual({ observedAt: later.createdAt, periodEnd: "2026-10-28" });
    expect(seen.createdAt.getTime()).toBeLessThan(later.createdAt.getTime());
    expect(await goalEvidence(db, id, "purchase")).toMatchObject({ periodEnd: "2026-10-28" });
    expect(await goalEvidence(db, id, "sign_up")).toBeNull();
    // Exact match: GA4 event names are case sensitive.
    expect(await goalEvidence(db, id, "Generate_Lead")).toBeNull();
  });

  it("never reads another company's captures and takes the event name as data", async () => {
    const a = await workspace();
    const b = await workspace("https://otra.es/");
    await capture(a);
    expect(await goalEvidence(db, b, "generate_lead")).toBeNull();
    expect(await goalEvidence(db, a, `generate_lead" || true || "`)).toBeNull();
    expect(await goalEvidence(db, a, "$event")).toBeNull();
    expect((await db.execute(sql`select count(*)::int as n from analytics_snapshots`)).rows[0]).toEqual({ n: 1 });
  });
});
