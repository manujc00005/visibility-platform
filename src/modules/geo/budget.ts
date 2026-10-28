import { and, eq, gte, inArray, sql } from "drizzle-orm";
import type { Database } from "@/db/client";
import { formatNumber } from "@/i18n/format";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { providerSpend } from "@/modules/geo/schema";

/**
 * Exact budget control for paid providers (B04).
 *
 * - Money is integer micro-USD (1 USD = 1_000_000). No floating point arithmetic.
 * - Fail-closed: without a configured monthly cap, nothing paid can be dispatched.
 * - Reservations are taken under a transaction-scoped advisory lock, so concurrent
 *   measurements cannot jointly exceed the cap.
 * - reserved, settled and uncertain rows count against the cap; only released rows do not.
 *   An uncertain charge is never released by a timeout: it stays counted until reconciled.
 */

export const MICROS_PER_USD = 1_000_000;
const BUDGET_LOCK_KEY = 4_420_001; // arbitrary constant: one lock for the whole spend ledger

export class BudgetNotConfiguredError extends Error {
  constructor() {
    super("No hay presupuesto mensual configurado para proveedores de pago (GEO_MONTHLY_BUDGET_USD).");
    this.name = "BudgetNotConfiguredError";
  }
}

export class BudgetExceededError extends Error {
  constructor(
    public readonly capMicros: number,
    public readonly committedMicros: number,
    public readonly requestedMicros: number,
  ) {
    super("El presupuesto mensual no alcanza para esta medición.");
    this.name = "BudgetExceededError";
  }
}

/** "5" → 5_000_000, "0.0012" → 1_200. Rejects anything that is not a plain decimal. */
export function parseUsdToMicros(value: string | undefined | null): number | null {
  const trimmed = value?.trim();
  if (!trimmed || !/^\d{1,7}(\.\d{1,6})?$/.test(trimmed)) return null;
  const [whole, fraction = ""] = trimmed.split(".");
  return Number(whole) * MICROS_PER_USD + Number(fraction.padEnd(6, "0"));
}

/** Provider costs arrive as JSON floats (e.g. 0.0012); round once to the nearest micro-USD. */
export function usdFloatToMicros(value: unknown): number | null {
  if (typeof value !== "number" || !Number.isFinite(value) || value < 0) return null;
  return Math.round(value * MICROS_PER_USD);
}

/** Amount in the interface language. "min2" keeps the previous grouping (no separator in four-digit amounts). */
export function formatMicros(micros: number, locale: Locale = DEFAULT_LOCALE): string {
  return `${formatNumber(micros / MICROS_PER_USD, locale, { minimumFractionDigits: 2, maximumFractionDigits: 4, useGrouping: "min2" })} USD`;
}

function monthStart(now: Date): Date {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1));
}

type Tx = Parameters<Parameters<Database["transaction"]>[0]>[0];

export async function committedThisMonth(db: Database | Tx, now = new Date()): Promise<number> {
  const [row] = await db
    .select({ total: sql<string>`coalesce(sum(${providerSpend.amountMicroUsd}), 0)::text` })
    .from(providerSpend)
    .where(and(gte(providerSpend.createdAt, monthStart(now)), inArray(providerSpend.status, ["reserved", "settled", "uncertain"])));
  return Number(row?.total ?? 0);
}

export interface ReserveInput {
  provider: string;
  operation: string;
  priceVersion: string;
  unitMicros: number;
  workspaceId: string;
  runId: string;
  observationIds: string[];
}

/**
 * Reserves one unit per observation inside the caller's transaction. Throws when the cap is
 * missing or would be exceeded; the caller's transaction then rolls back the whole run.
 */
export async function reserveSpend(tx: Tx, capMicros: number | null, input: ReserveInput, now = new Date()) {
  if (capMicros === null || capMicros <= 0) throw new BudgetNotConfiguredError();
  if (!Number.isSafeInteger(input.unitMicros) || input.unitMicros <= 0) throw new Error("Invalid unit price");
  await tx.execute(sql`select pg_advisory_xact_lock(${BUDGET_LOCK_KEY})`);
  const committed = await committedThisMonth(tx, now);
  const requested = input.unitMicros * input.observationIds.length;
  if (committed + requested > capMicros) throw new BudgetExceededError(capMicros, committed, requested);
  return tx
    .insert(providerSpend)
    .values(
      input.observationIds.map((observationId) => ({
        provider: input.provider,
        operation: input.operation,
        priceVersion: input.priceVersion,
        workspaceId: input.workspaceId,
        runId: input.runId,
        observationId,
        amountMicroUsd: input.unitMicros,
        status: "reserved" as const,
      })),
    )
    .returning({ id: providerSpend.id, observationId: providerSpend.observationId });
}

/** Records the provider's actual charge. Idempotent: only reserved or uncertain rows move. */
export async function settleSpend(db: Database | Tx, observationId: string, actualMicros: number | null) {
  await db
    .update(providerSpend)
    .set({
      status: "settled",
      settledAt: sql`now()`,
      ...(actualMicros !== null ? { amountMicroUsd: actualMicros } : {}),
    })
    .where(and(eq(providerSpend.observationId, observationId), inArray(providerSpend.status, ["reserved", "uncertain"])));
}

/** Only for requests the provider demonstrably rejected without charging. */
export async function releaseSpend(db: Database | Tx, observationId: string) {
  await db
    .update(providerSpend)
    .set({ status: "released", settledAt: sql`now()` })
    .where(and(eq(providerSpend.observationId, observationId), eq(providerSpend.status, "reserved")));
}

export async function markSpendUncertain(db: Database | Tx, observationId: string) {
  await db
    .update(providerSpend)
    .set({ status: "uncertain" })
    .where(and(eq(providerSpend.observationId, observationId), eq(providerSpend.status, "reserved")));
}
