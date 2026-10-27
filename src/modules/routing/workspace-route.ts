/**
 * Which stored records a `/workspaces/...` document URL depends on, so the proxy can answer
 * a real 404 before the page streams. Pure: no I/O. See `src/proxy.ts` for why the page's own
 * `notFound()` is not enough in the production build.
 */
export type WorkspaceRoute =
  | { kind: "skip" }
  | { kind: "invalid" }
  | { kind: "check"; workspaceId: string; auditId: string | null; runId: string | null };

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function parseWorkspaceRoute(pathname: string): WorkspaceRoute {
  const parts = pathname.split("/").filter(Boolean);
  // `/workspaces` and the static `/workspaces/new` do not depend on a record.
  if (parts[0] !== "workspaces" || parts.length < 2 || parts[1] === "new") return { kind: "skip" };
  const [, workspaceId, section, second, third] = parts;
  if (!UUID.test(workspaceId!)) return { kind: "invalid" };
  if (section === "audits" && second !== undefined) {
    return UUID.test(second) ? { kind: "check", workspaceId: workspaceId!, auditId: second, runId: null } : { kind: "invalid" };
  }
  if (section === "geo" && second === "runs" && third !== undefined) {
    return UUID.test(third) ? { kind: "check", workspaceId: workspaceId!, auditId: null, runId: third } : { kind: "invalid" };
  }
  return { kind: "check", workspaceId: workspaceId!, auditId: null, runId: null };
}
