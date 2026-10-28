import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { AppHeader, MAIN_CONTENT_ID } from "@/components/layout/app-header";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import "./globals.css";

// The layout reads the locale cookie, so it renders per request. With `cacheComponents`,
// Next only allows that at the root (where `<html lang>` cannot sit inside Suspense) when
// the segment opts out of instant-navigation validation («Opt the layout out»).
export const instant = false;

const geistSans = Geist({ variable: "--font-sans", subsets: ["latin"] });
const geistMono = Geist_Mono({ variable: "--font-geist-mono", subsets: ["latin"] });

/** The brand stays in the title in both languages; only the description is translated. */
export async function generateMetadata(): Promise<Metadata> {
  const messages = getMessages(await getLocale());
  return {
    title: { default: messages.common.brand, template: `%s · ${messages.common.brand}` },
    description: messages.meta.description,
    robots: { index: false, follow: false },
  };
}

export default async function RootLayout({ children }: LayoutProps<"/">) {
  const locale = await getLocale();
  const messages = getMessages(locale);
  return (
    <html lang={locale} className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col bg-background text-foreground">
        <AppHeader locale={locale} messages={messages} />
        {/* Focusable so the skip link lands here; no outline, the target is the content itself. */}
        <main id={MAIN_CONTENT_ID} tabIndex={-1} className="mx-auto w-full max-w-5xl flex-1 px-4 py-8 outline-none sm:px-6">
          {children}
        </main>
      </body>
    </html>
  );
}
