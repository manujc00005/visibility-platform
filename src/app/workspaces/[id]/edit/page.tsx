import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { WorkspaceForm } from "@/components/workspaces/workspace-form";
import { getDb } from "@/db/client";
import { formValuesOf } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";
import { COUNTRY_OPTIONS } from "@/modules/workspaces/validation";
import { updateWorkspaceAction } from "../../actions";

export const metadata: Metadata = { title: "Editar empresa" };

/**
 * Blocking route: the whole page depends on one record, and rendering it before the
 * response starts is what lets an unknown id return a real 404 instead of a streamed 200.
 */
export const instant = false;

export default async function EditWorkspacePage({ params }: PageProps<"/workspaces/[id]/edit">) {
  await connection();
  const { id } = await params;
  const workspace = await getWorkspace(getDb(), id);
  if (!workspace) notFound();

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Editar empresa</h1>
        <p className="text-sm text-muted-foreground">{workspace.name}</p>
      </div>
      <WorkspaceForm
        action={updateWorkspaceAction.bind(null, workspace.id)}
        initialValues={formValuesOf(workspace)}
        countries={COUNTRY_OPTIONS}
        submitLabel="Guardar cambios"
        cancelHref={`/workspaces/${workspace.id}`}
      />
    </div>
  );
}
