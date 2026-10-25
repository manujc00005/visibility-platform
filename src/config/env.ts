import { z } from "zod";

/**
 * Server-side environment, validated once and cached.
 *
 * Validation is lazy (on first call) so that `next build` and tooling that import
 * this module do not fail when a variable is only needed at runtime.
 */
const envSchema = z.object({
  NODE_ENV: z.enum(["development", "test", "production"]).default("development"),
  DATABASE_URL: z
    .string({ error: "DATABASE_URL is required (see .env.example)" })
    .min(1, "DATABASE_URL is required (see .env.example)")
    .refine(
      (value) => /^postgres(ql)?:\/\//.test(value),
      "DATABASE_URL must be a postgres:// or postgresql:// connection string",
    ),
  /**
   * Direct (non-pooled) connection string. Neon writes it as DATABASE_URL_UNPOOLED.
   * Used only for migrations: PgBouncer in transaction mode does not keep session state.
   * Optional: without it (local Postgres) migrations use DATABASE_URL.
   */
  DATABASE_URL_UNPOOLED: z
    .string()
    .refine(
      (value) => /^postgres(ql)?:\/\//.test(value),
      "DATABASE_URL_UNPOOLED must be a postgres:// or postgresql:// connection string",
    )
    .optional(),
  /** Google PageSpeed Insights API key. Optional: without it the performance section is "not configured". */
  PAGESPEED_API_KEY: z
    .string()
    .optional()
    .transform((value) => value?.trim() || undefined),
  LOG_LEVEL: z
    .enum(["fatal", "error", "warn", "info", "debug", "trace", "silent"])
    .default("info"),
});

export type Env = z.infer<typeof envSchema>;

export class InvalidEnvironmentError extends Error {
  constructor(public readonly issues: string[]) {
    super(`Invalid environment:\n- ${issues.join("\n- ")}`);
    this.name = "InvalidEnvironmentError";
  }
}

/** Parses an arbitrary source. Exported for tests; application code uses `env()`. */
export function parseEnv(source: Record<string, string | undefined>): Env {
  const result = envSchema.safeParse(source);
  if (!result.success) {
    throw new InvalidEnvironmentError(
      result.error.issues.map((issue) => `${issue.path.join(".") || "env"}: ${issue.message}`),
    );
  }
  return result.data;
}

/** Connection string for schema migrations: the direct URL when available. */
export function migrationDatabaseUrl(value: Env): string {
  return value.DATABASE_URL_UNPOOLED ?? value.DATABASE_URL;
}

let cached: Env | undefined;

export function env(): Env {
  cached ??= parseEnv(process.env);
  return cached;
}
