"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { CompetitorComparisonState } from "@/app/workspaces/[id]/seo/actions";

interface Props {
  labels: { idle: string; pending: string; failed: string };
  action: (state: CompetitorComparisonState) => Promise<CompetitorComparisonState>;
}

export function ComparisonButton({ labels, action }: Props) {
  // Minutes of waiting: a lost connection must end in this message, not in an error that takes the page down.
  const guarded = async (previous: CompetitorComparisonState) => {
    try {
      return await action(previous);
    } catch {
      return { error: labels.failed };
    }
  };
  const [state, formAction, pending] = useActionState(guarded, { error: null });
  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? labels.pending : labels.idle}
      </Button>
      <p role="status" className="sr-only">
        {pending ? labels.pending : ""}
      </p>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
