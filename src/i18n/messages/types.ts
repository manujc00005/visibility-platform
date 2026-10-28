import type { es } from "@/i18n/messages/es";

/**
 * Shape of every catalog, derived from the Spanish one: string leaves stay `string` (not
 * the Spanish literal) and function leaves keep their signatures, so another language can
 * return different text while being forced to provide every key (D015).
 */
export type Messages = typeof es;
