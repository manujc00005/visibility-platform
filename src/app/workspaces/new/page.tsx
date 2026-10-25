import type { Metadata } from "next";
import { WorkspaceForm } from "@/components/workspaces/workspace-form";
import { COUNTRY_OPTIONS } from "@/modules/workspaces/validation";
import { createWorkspaceAction } from "../actions";

export const metadata: Metadata = { title: "Nueva empresa" };

export default function NewWorkspacePage() {
  return (
    <div className="flex flex-col gap-6">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight">Nueva empresa</h1>
        <p className="text-sm text-muted-foreground">Datos necesarios para preparar su auditoría.</p>
      </div>
      <WorkspaceForm
        action={createWorkspaceAction}
        initialValues={{ name: "", website: "", sector: "", country: "ES", city: "", services: "" }}
        countries={COUNTRY_OPTIONS}
        submitLabel="Crear empresa"
        cancelHref="/workspaces"
      />
    </div>
  );
}
