import type { Locale } from "@/i18n/locale";
import { en } from "@/i18n/messages/en";
import { es } from "@/i18n/messages/es";
import type { Messages } from "@/i18n/messages/types";

export type { Messages } from "@/i18n/messages/types";

const CATALOGS: Record<Locale, Messages> = { es, en };

/** Full catalog for a language. Server side only: Client Components get fragments by props. */
export function getMessages(locale: Locale): Messages {
  return CATALOGS[locale];
}
