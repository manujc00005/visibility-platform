import { z } from "zod";
import { WEBSITE_ERROR_MESSAGES, normalizeWebsite } from "@/modules/workspaces/domain";

/**
 * Server-side validation for workspace create/edit. The form only adds HTML hints; this
 * schema is the source of truth and runs inside the Server Actions.
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
const regionNames = new Intl.DisplayNames(["es"], { type: "region", fallback: "none" });

export function countryName(code: string): string | undefined {
  if (!/^[A-Z]{2}$/.test(code) || NON_COUNTRY_REGIONS.has(code)) return undefined;
  return regionNames.of(code);
}

/** Countries offered first in the form; any valid ISO 3166-1 alpha-2 code is accepted. */
export const COUNTRY_OPTIONS = ["ES", "PT", "FR", "IT", "DE", "GB", "IE", "NL", "BE", "US", "MX", "AR", "CO", "CL", "PE"].map(
  (code) => ({ code, name: countryName(code) ?? code }),
);

const requiredText = (label: string, max: number) =>
  z
    .string({ error: `${label} es obligatorio.` })
    .trim()
    .min(1, `${label} es obligatorio.`)
    .max(max, `${label} admite como máximo ${max} caracteres.`);

const servicesField = z
  .union([z.string(), z.array(z.string())], { error: "Indica al menos un servicio." })
  .transform((value) => {
    const items = (Array.isArray(value) ? value : value.split(/\r?\n/)).map((item) => item.trim()).filter(Boolean);
    const seen = new Set<string>();
    return items.filter((item) => {
      const key = item.toLocaleLowerCase("es");
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });
  })
  .pipe(
    z
      .array(z.string().max(LIMITS.service, `Cada servicio admite como máximo ${LIMITS.service} caracteres.`))
      .min(1, "Indica al menos un servicio.")
      .max(LIMITS.services, `Indica como máximo ${LIMITS.services} servicios.`),
  );

const workspaceInputSchema = z
  .object({
    name: requiredText("El nombre comercial", LIMITS.name),
    website: z.string({ error: WEBSITE_ERROR_MESSAGES.required }).transform((value, ctx) => {
      const website = normalizeWebsite(value);
      if (!website.ok) {
        ctx.addIssue({ code: "custom", message: WEBSITE_ERROR_MESSAGES[website.error] });
        return z.NEVER;
      }
      return website.value;
    }),
    sector: requiredText("El sector", LIMITS.sector),
    country: z
      .string({ error: "Selecciona un país." })
      .trim()
      .toUpperCase()
      .refine((code) => countryName(code) !== undefined, "Selecciona un país válido."),
    city: z
      .string()
      .trim()
      .max(LIMITS.city, `La ciudad admite como máximo ${LIMITS.city} caracteres.`)
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

export type WorkspaceInput = z.output<typeof workspaceInputSchema>;
export type WorkspaceField = "name" | "website" | "sector" | "country" | "city" | "services";
export type FieldErrors = Partial<Record<WorkspaceField, string[]>>;

export type ParseResult = { success: true; data: WorkspaceInput } | { success: false; fieldErrors: FieldErrors };

export function parseWorkspaceInput(raw: unknown): ParseResult {
  const result = workspaceInputSchema.safeParse(raw);
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
