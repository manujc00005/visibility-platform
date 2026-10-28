import { domainToUnicode } from "node:url";
import { formatDateTime } from "@/i18n/format";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import type { Workspace } from "@/modules/workspaces/schema";
import { countryName, type WorkspaceFormValues } from "@/modules/workspaces/validation";

/** Server-side helpers to show a stored workspace. `locale` defaults to Spanish (D007). */

export function displayDomain(domain: string): string {
  return domainToUnicode(domain) || domain;
}

export function displayCountry(code: string, locale: Locale = DEFAULT_LOCALE): string {
  return countryName(code, locale) ?? code;
}

/** Medium date and short time in Europe/Madrid («27 oct 2026, 13:34» / «27 Oct 2026, 13:34»). */
export function displayDate(date: Date, locale: Locale = DEFAULT_LOCALE): string {
  return formatDateTime(date, locale);
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
