import { z } from "zod";
import { regionName } from "@/i18n/format";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import { normalizeWebsite } from "@/modules/workspaces/domain";

/**
 * Server-side validation for workspace create/edit. The form only adds HTML hints; this
 * schema is the source of truth and runs inside the Server Actions. Messages come from the
 * catalog of the requested language; the default (`es`) keeps the original texts.
 */

export const LIMITS = {
  name: 120,
  sector: 80,
  city: 120,
  services: 10,
  service: 80,
} as const;

/** Codes that CLDR names but that are not countries. */
const NON_COUNTRY_REGIONS = new Set(["EU", "EZ", "UN", "ZZ", "QO", "XA", "XB"]);

export function countryName(code: string, locale: Locale = DEFAULT_LOCALE): string | undefined {
  if (!/^[A-Z]{2}$/.test(code) || NON_COUNTRY_REGIONS.has(code)) return undefined;
  return regionName(code, locale);
}

const COUNTRY_CODES = ["ES", "PT", "FR", "IT", "DE", "GB", "IE", "NL", "BE", "US", "MX", "AR", "CO", "CL", "PE"];

/** Countries offered first in the form, named in the interface language; any valid ISO 3166-1 alpha-2 code is accepted. */
export function countryOptions(locale: Locale = DEFAULT_LOCALE): { code: string; name: string }[] {
  return COUNTRY_CODES.map((code) => ({ code, name: countryName(code, locale) ?? code }));
}

function buildSchema(locale: Locale) {
  const { workspace: t, website: websiteErrors } = getMessages(locale).validation;

  const requiredText = (label: string, max: number) =>
    z.string({ error: t.required(label) }).trim().min(1, t.required(label)).max(max, t.maxLength(label, max));

  const servicesField = z
    .union([z.string(), z.array(z.string())], { error: t.servicesRequired })
    .transform((value) => {
      const items = (Array.isArray(value) ? value : value.split(/\r?\n/)).map((item) => item.trim()).filter(Boolean);
      const seen = new Set<string>();
      return items.filter((item) => {
        // Duplicate detection is data normalization, not display: it stays language-independent.
        const key = item.toLocaleLowerCase("es");
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      });
    })
    .pipe(
      z
        .array(z.string().max(LIMITS.service, t.serviceMaxLength(LIMITS.service)))
        .min(1, t.servicesRequired)
        .max(LIMITS.services, t.servicesMax(LIMITS.services)),
    );

  return z
    .object({
      name: requiredText(t.nameLabel, LIMITS.name),
      website: z.string({ error: websiteErrors.required }).transform((value, ctx) => {
        const website = normalizeWebsite(value);
        if (!website.ok) {
          ctx.addIssue({ code: "custom", message: websiteErrors[website.error] });
          return z.NEVER;
        }
        return website.value;
      }),
      sector: requiredText(t.sectorLabel, LIMITS.sector),
      country: z
        .string({ error: t.countryRequired })
        .trim()
        .toUpperCase()
        .refine((code) => countryName(code) !== undefined, t.countryInvalid),
      city: z
        .string()
        .trim()
        .max(LIMITS.city, t.cityMaxLength(LIMITS.city))
        .optional()
        .nullable()
        .transform((value) => (value ? value : null)),
      services: servicesField,
    })
    .transform((input) => ({
      name: input.name,
      domain: input.website.domain,
      hostname: input.website.hostname,
      originalUrl: input.website.originalInput,
      sector: input.sector,
      country: input.country,
      city: input.city,
      services: input.services,
    }));
}

type WorkspaceInputSchema = ReturnType<typeof buildSchema>;
const schemas = new Map<Locale, WorkspaceInputSchema>();

/** Schema factory (D007): one schema per language, built on first use. */
export function workspaceInputSchemaFor(locale: Locale = DEFAULT_LOCALE): WorkspaceInputSchema {
  let schema = schemas.get(locale);
  if (!schema) {
    schema = buildSchema(locale);
    schemas.set(locale, schema);
  }
  return schema;
}

export type WorkspaceInput = z.output<WorkspaceInputSchema>;
export type WorkspaceField = "name" | "website" | "sector" | "country" | "city" | "services";
export type FieldErrors = Partial<Record<WorkspaceField, string[]>>;

export type ParseResult = { success: true; data: WorkspaceInput } | { success: false; fieldErrors: FieldErrors };

export function parseWorkspaceInput(raw: unknown, locale: Locale = DEFAULT_LOCALE): ParseResult {
  const result = workspaceInputSchemaFor(locale).safeParse(raw);
  if (result.success) return { success: true, data: result.data };
  const fieldErrors: FieldErrors = {};
  for (const issue of result.error.issues) {
    const field = issue.path[0] as WorkspaceField | undefined;
    if (!field) continue;
    (fieldErrors[field] ??= []).push(issue.message);
  }
  return { success: false, fieldErrors };
}

/** Raw form values, kept as typed so the form can be re-filled after an error. */
export interface WorkspaceFormValues {
  name: string;
  website: string;
  sector: string;
  country: string;
  city: string;
  services: string;
}

export function formValuesFrom(formData: FormData): WorkspaceFormValues {
  const text = (key: keyof WorkspaceFormValues) => {
    const value = formData.get(key);
    return typeof value === "string" ? value : "";
  };
  return {
    name: text("name"),
    website: text("website"),
    sector: text("sector"),
    country: text("country"),
    city: text("city"),
    services: text("services"),
  };
}
