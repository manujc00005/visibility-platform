import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";

/**
 * Global not-found page. Served with a real 404 for unknown URLs and, through `src/proxy.ts`,
 * for unknown workspace, audit or measurement ids on direct visits.
 */
export default async function NotFound() {
  const { notFound } = getMessages(await getLocale());
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{notFound.title}</h1>
      <p className="text-sm text-muted-foreground">{notFound.description}</p>
      <Link href="/workspaces" className={buttonVariants({ variant: "outline" })}>
        {notFound.backToWorkspaces}
      </Link>
    </div>
  );
}
