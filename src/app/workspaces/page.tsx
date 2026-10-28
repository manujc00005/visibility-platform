import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { connection } from "next/server";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import type { Locale } from "@/i18n/locale";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { displayCountry, displayDate, displayDomain } from "@/modules/workspaces/presentation";
import { listWorkspaces } from "@/modules/workspaces/service";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).workspaces.list.title };
}

export default async function WorkspacesPage() {
  const locale = await getLocale();
  return (
    <Suspense fallback={<PageLoading label={getMessages(locale).common.loading} />}>
      <WorkspaceList locale={locale} />
    </Suspense>
  );
}

async function WorkspaceList({ locale }: { locale: Locale }) {
  await connection();
  const t = getMessages(locale).workspaces.list;
  const workspaces = await listWorkspaces(getDb());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{t.title}</h1>
          <p className="text-sm text-muted-foreground">{t.description}</p>
        </div>
        <Link href="/workspaces/new" className={buttonVariants()}>
          {t.newWorkspace}
        </Link>
      </div>

      {workspaces.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">{t.emptyTitle}</p>
          <p className="mt-1 text-sm text-muted-foreground">{t.emptyDescription}</p>
          <Link href="/workspaces/new" className={`${buttonVariants({ variant: "outline" })} mt-4`}>
            {t.register}
          </Link>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>{t.columns.name}</TableHead>
              <TableHead>{t.columns.domain}</TableHead>
              <TableHead>{t.columns.sector}</TableHead>
              <TableHead>{t.columns.location}</TableHead>
              <TableHead>{t.columns.createdAt}</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {workspaces.map((workspace) => (
              <TableRow key={workspace.id}>
                <TableCell>
                  <Link href={`/workspaces/${workspace.id}`} className="font-medium hover:underline">
                    {workspace.name}
                  </Link>
                </TableCell>
                <TableCell className="font-mono text-xs">{displayDomain(workspace.domain)}</TableCell>
                <TableCell>{workspace.sector}</TableCell>
                <TableCell>
                  {[workspace.city, displayCountry(workspace.country, locale)].filter(Boolean).join(", ")}
                </TableCell>
                <TableCell className="text-muted-foreground">{displayDate(workspace.createdAt, locale)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
