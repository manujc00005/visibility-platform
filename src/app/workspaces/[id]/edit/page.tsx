import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { WorkspaceForm } from "@/components/workspaces/workspace-form";
import { getDb } from "@/db/client";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { formValuesOf } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";
import { countryOptions } from "@/modules/workspaces/validation";
import { updateWorkspaceAction } from "../../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).workspaces.edit.title };
}

/**
 * Blocking route: the whole page depends on one record, and rendering it before the
 * response starts is what lets an unknown id return a real 404 instead of a streamed 200.
 */
export const instant = false;

export default async function EditWorkspacePage({ params }: PageProps<"/workspaces/[id]/edit">) {
  await connection();
  const { id } = await params;
  const locale = await getLocale();
  const workspace = await getWorkspace(getDb(), id);
  if (!workspace) notFound();
  const { workspaces } = getMessages(locale);

  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{workspaces.edit.title}</h1>
        <p className="text-sm text-muted-foreground">{workspace.name}</p>
      </div>
      {/* Remount on language change: the form state (values and messages) belongs to one language (SPEC, límite conocido). */}
      <WorkspaceForm
        key={locale}
        action={updateWorkspaceAction.bind(null, workspace.id)}
        initialValues={formValuesOf(workspace)}
        countries={countryOptions(locale)}
        labels={workspaces.form}
        submitLabel={workspaces.edit.submit}
        cancelHref={`/workspaces/${workspace.id}`}
      />
    </div>
  );
}
