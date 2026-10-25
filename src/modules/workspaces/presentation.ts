import { domainToUnicode } from "node:url";
import type { Workspace } from "@/modules/workspaces/schema";
import { countryName, type WorkspaceFormValues } from "@/modules/workspaces/validation";

/** Server-side helpers to show a stored workspace. */

export function displayDomain(domain: string): string {
  return domainToUnicode(domain) || domain;
}

export function displayCountry(code: string): string {
  return countryName(code) ?? code;
}

const dateFormat = new Intl.DateTimeFormat("es-ES", {
  dateStyle: "medium",
  timeStyle: "short",
  timeZone: "Europe/Madrid",
});

export function displayDate(date: Date): string {
  return dateFormat.format(date);
}

export function formValuesOf(workspace: Workspace): WorkspaceFormValues {
  return {
    name: workspace.name,
    website: workspace.originalUrl,
    sector: workspace.sector,
    country: workspace.country,
    city: workspace.city ?? "",
    services: workspace.services.join("\n"),
  };
}
