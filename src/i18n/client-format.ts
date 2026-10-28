/**
 * Serializable message fragments for Client Components and the small, pure helpers that
 * fill them (SPEC «Contrato servidor/cliente», D015). This module imports no catalog and
 * no request API, so it is safe to import from `"use client"` files.
 *
 * Server Components evaluate catalog functions and pass the resulting strings down. For
 * values that only exist in the browser (a count that changes on interaction), the server
 * passes a template with `{name}` placeholders, or plural forms, and the client fills it.
 */
import { intlTag, type Locale } from "@/i18n/locale";

/** `{count}` is filled with the formatted count; other placeholders come from `params`. */
export interface PluralForms {
  one: string;
  other: string;
}

export type ClientMessageLeaf = string | PluralForms;

/** Nested string/plural leaves only. Functions are rejected at every depth by the type. */
export type ClientMessages = {
  readonly [key: string]: ClientMessageLeaf | ClientMessages;
};

export type TemplateParams = Record<string, string | number>;

const PLACEHOLDER = /\{([a-zA-Z0-9_]+)\}/g;

/** Replaces `{name}` with `params.name`. Unknown placeholders are left as written. */
export function fillTemplate(template: string, params: TemplateParams): string {
  return template.replace(PLACEHOLDER, (match, name: string) => {
    const value = params[name];
    return value === undefined ? match : String(value);
  });
}

/** Picks the plural form with `Intl.PluralRules` and fills `{count}` plus `params`. */
export function plural(locale: Locale, forms: PluralForms, count: number, params: TemplateParams = {}): string {
  const tag = intlTag(locale);
  const form = new Intl.PluralRules(tag).select(count) === "one" ? forms.one : forms.other;
  return fillTemplate(form, { ...params, count: new Intl.NumberFormat(tag).format(count) });
}
