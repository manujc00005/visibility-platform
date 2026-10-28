import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";

export default async function WorkspaceNotFound() {
  const { workspaces, notFound } = getMessages(await getLocale());
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">{workspaces.notFound.title}</h1>
      <p className="text-sm text-muted-foreground">{workspaces.notFound.description}</p>
      <Link href="/workspaces" className={buttonVariants({ variant: "outline" })}>
        {notFound.backToWorkspaces}
      </Link>
    </div>
  );
}
