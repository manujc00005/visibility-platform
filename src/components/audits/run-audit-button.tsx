"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { RunAuditState } from "@/app/workspaces/[id]/audits/actions";
import type { Messages } from "@/i18n/messages";

/** Serializable fragment of the catalog (strings only), passed by the page. */
export type RunAuditLabels = Messages["audits"]["runButton"];

interface Props {
  workspaceId: string;
  action: (state: RunAuditState) => Promise<RunAuditState>;
  labels: RunAuditLabels;
}

export function RunAuditButton({ workspaceId, action, labels }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null, runningAuditId: null });
  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <Button type="submit" disabled={pending}>
        {pending ? labels.running : labels.run}
      </Button>
      {pending ? (
        <p role="status" className="text-sm text-muted-foreground">
          {labels.runningHint}
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}{" "}
          {state.runningAuditId ? (
            <Link href={`/workspaces/${workspaceId}/audits/${state.runningAuditId}`} className="underline">
              {labels.viewRunning}
            </Link>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
