import type { Metadata } from "next";
import { WorkspaceForm } from "@/components/workspaces/workspace-form";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { countryOptions } from "@/modules/workspaces/validation";
import { createWorkspaceAction } from "../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).workspaces.create.title };
}

export default async function NewWorkspacePage() {
  const locale = await getLocale();
  const { workspaces } = getMessages(locale);
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">{workspaces.create.title}</h1>
        <p className="text-sm text-muted-foreground">{workspaces.create.description}</p>
      </div>
      {/* Remount on language change: the form state (values and messages) belongs to one language (SPEC, límite conocido). */}
      <WorkspaceForm
        key={locale}
        action={createWorkspaceAction}
        initialValues={{ name: "", website: "", sector: "", country: "ES", city: "", services: "" }}
        countries={countryOptions(locale)}
        labels={workspaces.form}
        submitLabel={workspaces.create.submit}
        cancelHref="/workspaces"
      />
    </div>
  );
}
