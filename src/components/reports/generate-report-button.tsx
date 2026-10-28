"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { GenerateReportState } from "@/app/workspaces/[id]/audits/[auditId]/actions";
import type { Messages } from "@/i18n/messages";

/** Serializable fragment of the catalog (strings only), passed by the page. */
export type GenerateReportLabels = Messages["audits"]["reportButton"];

export function GenerateReportButton({ action, labels }: { action: () => Promise<GenerateReportState>; labels: GenerateReportLabels }) {
  const [state, formAction, pending] = useActionState(action, { error: null, generatedId: null });
  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <Button type="submit" disabled={pending}>
        {pending ? labels.generating : labels.generate}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : state.generatedId && !pending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {labels.generated}
        </p>
      ) : null}
    </form>
  );
}
