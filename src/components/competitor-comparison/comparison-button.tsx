"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { CompetitorComparisonState } from "@/app/workspaces/[id]/seo/actions";

interface Props {
  labels: { idle: string; pending: string };
  action: (state: CompetitorComparisonState) => Promise<CompetitorComparisonState>;
}

export function ComparisonButton({ labels, action }: Props) {
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
