import pino from "pino";

/**
 * Structured JSON logger. Secrets are redacted by path so that a careless
 * `logger.info({ headers })` never writes credentials to the log stream.
 */
export const REDACTED_PATHS = [
  "password",
  "*.password",
  "token",
  "*.token",
  "authorization",
  "*.authorization",
  "headers.authorization",
  "headers.cookie",
  "cookie",
  "*.cookie",
  "databaseUrl",
  "*.databaseUrl",
  "DATABASE_URL",
  "private_key",
  "*.private_key",
  "access_token",
  "*.access_token",
  "assertion",
  "*.assertion",
  "GSC_SERVICE_ACCOUNT_JSON",
];

export function createLogger(options: { level?: string; destination?: pino.DestinationStream } = {}) {
  return pino(
    {
      level: options.level ?? process.env.LOG_LEVEL ?? "info",
      base: { service: "visibility-platform" },
      redact: { paths: REDACTED_PATHS, censor: "[REDACTED]" },
      timestamp: pino.stdTimeFunctions.isoTime,
    },
    options.destination,
  );
}

export const logger = createLogger();
