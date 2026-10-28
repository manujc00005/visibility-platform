"use server";

import { revalidatePath } from "next/cache";
import { cookies } from "next/headers";
import { isLocale, LOCALE_COOKIE } from "@/i18n/locale";

const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

/**
 * Stores the interface language chosen in the header (SPEC §2, FR-002). Only supported
 * values are written; anything else is ignored without an error. No redirect: the page
 * that submitted the form re-renders in the new language at the same URL, also without
 * JavaScript. Revalidating the layout refreshes every cached segment that read the locale.
 */
export async function setLocaleAction(formData: FormData): Promise<void> {
  const value = formData.get(LOCALE_COOKIE);
  if (!isLocale(value)) return;
  (await cookies()).set({
    name: LOCALE_COOKIE,
    value,
    path: "/",
    sameSite: "lax",
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    maxAge: ONE_YEAR_SECONDS,
  });
  revalidatePath("/", "layout");
}
