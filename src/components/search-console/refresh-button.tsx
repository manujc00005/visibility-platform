"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { RefreshSearchConsoleState } from "@/app/workspaces/[id]/seo/actions";

/** Serializable labels chosen by the server page (i18n D015). */
export interface RefreshSearchConsoleLabels {
  idle: string;
  pending: string;
}

interface Props {
  labels: RefreshSearchConsoleLabels;
  action: (state: RefreshSearchConsoleState) => Promise<RefreshSearchConsoleState>;
}

export function RefreshSearchConsoleButton({ labels, action }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? labels.pending : labels.idle}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
