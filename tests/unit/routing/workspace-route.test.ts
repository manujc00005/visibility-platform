import { describe, expect, it } from "vitest";
import { parseWorkspaceRoute } from "@/modules/routing/workspace-route";

const W = "52429306-8ae3-40aa-8d10-12bfe67c61a5";
const A = "3709cad2-3a22-4484-b5bc-e874d9957627";

describe("parseWorkspaceRoute", () => {
  it("skips routes that do not depend on a record", () => {
    expect(parseWorkspaceRoute("/workspaces")).toEqual({ kind: "skip" });
    expect(parseWorkspaceRoute("/workspaces/new")).toEqual({ kind: "skip" });
    expect(parseWorkspaceRoute("/")).toEqual({ kind: "skip" });
  });

  it("rejects malformed ids without touching the database", () => {
    expect(parseWorkspaceRoute("/workspaces/abc")).toEqual({ kind: "invalid" });
    expect(parseWorkspaceRoute("/workspaces/abc/seo")).toEqual({ kind: "invalid" });
    expect(parseWorkspaceRoute(`/workspaces/${W}/audits/xyz`)).toEqual({ kind: "invalid" });
    expect(parseWorkspaceRoute(`/workspaces/${W}/geo/runs/xyz`)).toEqual({ kind: "invalid" });
  });

  it("checks the workspace for its own pages", () => {
    for (const path of ["", "/edit", "/performance", "/seo", "/geo", "/geo/setup"]) {
      expect(parseWorkspaceRoute(`/workspaces/${W}${path}`)).toEqual({ kind: "check", workspaceId: W, auditId: null, runId: null });
    }
  });

  it("checks nested audits (including their reports) and runs within the workspace", () => {
    expect(parseWorkspaceRoute(`/workspaces/${W}/audits/${A}`)).toEqual({ kind: "check", workspaceId: W, auditId: A, runId: null });
    expect(parseWorkspaceRoute(`/workspaces/${W}/audits/${A}/reports/${A}/pdf`)).toMatchObject({ auditId: A });
    expect(parseWorkspaceRoute(`/workspaces/${W}/geo/runs/${A}`)).toEqual({ kind: "check", workspaceId: W, auditId: null, runId: A });
  });
});
