"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { GenerateReportState } from "@/app/workspaces/[id]/audits/[auditId]/actions";

export function GenerateReportButton({ action }: { action: () => Promise<GenerateReportState> }) {
  const [state, formAction, pending] = useActionState(action, { error: null, generatedId: null });
  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <Button type="submit" disabled={pending}>
        {pending ? "Generando PDF…" : "Generar informe"}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : state.generatedId && !pending ? (
        <p role="status" className="text-sm text-muted-foreground">
          Informe generado.
        </p>
      ) : null}
    </form>
  );
}
