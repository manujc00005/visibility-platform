import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { PageLoading } from "@/components/page-loading";
import { connection } from "next/server";
import { buttonVariants } from "@/components/ui/button";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { getDb } from "@/db/client";
import { displayCountry, displayDate, displayDomain } from "@/modules/workspaces/presentation";
import { listWorkspaces } from "@/modules/workspaces/service";

export const metadata: Metadata = { title: "Empresas" };

export default function WorkspacesPage() {
  return (
    <Suspense fallback={<PageLoading />}>
      <WorkspaceList />
    </Suspense>
  );
}

async function WorkspaceList() {
  await connection();
  const workspaces = await listWorkspaces(getDb());

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">Empresas</h1>
          <p className="text-sm text-muted-foreground">Webs registradas para auditar.</p>
        </div>
        <Link href="/workspaces/new" className={buttonVariants()}>
          Nueva empresa
        </Link>
      </div>

      {workspaces.length === 0 ? (
        <div className="rounded-xl border border-dashed p-8 text-center">
          <p className="font-medium">Todavía no hay empresas.</p>
          <p className="mt-1 text-sm text-muted-foreground">Registra la primera web para preparar su auditoría.</p>
          <Link href="/workspaces/new" className={`${buttonVariants({ variant: "outline" })} mt-4`}>
            Registrar empresa
          </Link>
        </div>
      ) : (
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>Empresa</TableHead>
              <TableHead>Dominio</TableHead>
              <TableHead>Sector</TableHead>
              <TableHead>Ubicación</TableHead>
              <TableHead>Alta</TableHead>
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
                  {[workspace.city, displayCountry(workspace.country)].filter(Boolean).join(", ")}
                </TableCell>
                <TableCell className="text-muted-foreground">{displayDate(workspace.createdAt)}</TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      )}
    </div>
  );
}
