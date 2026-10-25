"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { RunAuditState } from "@/app/workspaces/[id]/audits/actions";

interface Props {
  workspaceId: string;
  action: (state: RunAuditState) => Promise<RunAuditState>;
}

export function RunAuditButton({ workspaceId, action }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null, runningAuditId: null });
  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <Button type="submit" disabled={pending}>
        {pending ? "Auditando…" : "Ejecutar auditoría"}
      </Button>
      {pending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Leyendo la web y midiendo su rendimiento. Puede tardar hasta un minuto.
        </p>
      ) : null}
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}{" "}
          {state.runningAuditId ? (
            <Link href={`/workspaces/${workspaceId}/audits/${state.runningAuditId}`} className="underline">
              Ver auditoría en curso
            </Link>
          ) : null}
        </p>
      ) : null}
    </form>
  );
}
