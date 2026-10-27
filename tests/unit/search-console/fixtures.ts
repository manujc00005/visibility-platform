import { generateKeyPairSync } from "node:crypto";

/** A throwaway RSA key pair generated per test run; never a real credential. */
export const keys = generateKeyPairSync("rsa", { modulusLength: 2048 });
export const PRIVATE_PEM = keys.privateKey.export({ type: "pkcs8", format: "pem" }).toString();

export function serviceAccountJson(overrides: Record<string, unknown> = {}): string {
  return JSON.stringify({
    type: "service_account",
    project_id: "demo",
    private_key_id: "kid-1",
    private_key: PRIVATE_PEM,
    client_email: "visibility@demo.iam.gserviceaccount.com",
    token_uri: "https://attacker.example/token",
    ...overrides,
  });
}

export interface Call {
  url: string;
  method: string;
  headers: Record<string, string>;
  body: string;
}

/** fetch double that answers by URL predicate, in order, and records every call. */
export function scripted(routes: { match: (url: string) => boolean; status: number; body?: unknown }[]) {
  const calls: Call[] = [];
  const impl = (async (input: string, init?: RequestInit) => {
    const url = String(input);
    calls.push({ url, method: init?.method ?? "GET", headers: { ...(init?.headers as Record<string, string>) }, body: String(init?.body ?? "") });
    const index = routes.findIndex((r) => r.match(url));
    if (index === -1) return new Response("{}", { status: 500 });
    const [route] = routes.splice(index, 1);
    return new Response(JSON.stringify(route!.body ?? {}), { status: route!.status });
  }) as typeof fetch;
  return { calls, impl };
}
