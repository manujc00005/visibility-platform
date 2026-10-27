import { createPrivateKey, type KeyObject } from "node:crypto";
import { z } from "zod";

/**
 * Service account key for Google Search Console (D001). Read from GSC_SERVICE_ACCOUNT_JSON,
 * raw JSON or base64 of it. Only the fields we need are kept; `token_uri` is ignored on purpose:
 * the token endpoint is a constant, never taken from configuration.
 */
export interface ServiceAccount {
  clientEmail: string;
  privateKeyId: string | null;
  privateKey: KeyObject;
}

const keySchema = z.object({
  type: z.literal("service_account"),
  client_email: z.string().regex(/^[^\s@]+@[^\s@]+\.[^\s@]+$/),
  private_key: z.string().min(1),
  private_key_id: z.string().optional(),
});

export type ParsedCredential = { ok: true; value: ServiceAccount } | { ok: false; reason: string };

function decode(raw: string): string {
  const trimmed = raw.trim();
  return trimmed.startsWith("{") ? trimmed : Buffer.from(trimmed, "base64").toString("utf8");
}

/** Never throws and never echoes the input: a bad value becomes a reason without key material. */
export function parseServiceAccount(raw: string | undefined): ParsedCredential | null {
  if (!raw) return null;
  let json: unknown;
  try {
    json = JSON.parse(decode(raw));
  } catch {
    return { ok: false, reason: "GSC_SERVICE_ACCOUNT_JSON no es un JSON válido (ni en crudo ni en base64)" };
  }
  const parsed = keySchema.safeParse(json);
  if (!parsed.success) return { ok: false, reason: "GSC_SERVICE_ACCOUNT_JSON no es una clave de cuenta de servicio de Google" };
  try {
    const privateKey = createPrivateKey(parsed.data.private_key);
    return { ok: true, value: { clientEmail: parsed.data.client_email, privateKeyId: parsed.data.private_key_id ?? null, privateKey } };
  } catch {
    return { ok: false, reason: "La clave privada de GSC_SERVICE_ACCOUNT_JSON no se puede leer" };
  }
}
