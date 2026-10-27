"use client";

import { useActionState } from "react";
import { Button } from "@/components/ui/button";
import type { RefreshSearchConsoleState } from "@/app/workspaces/[id]/seo/actions";

interface Props {
  label: string;
  action: (state: RefreshSearchConsoleState) => Promise<RefreshSearchConsoleState>;
}

export function RefreshSearchConsoleButton({ label, action }: Props) {
  const [state, formAction, pending] = useActionState(action, { error: null });
  return (
    <form action={formAction} className="flex flex-col items-start gap-2">
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Consultando Search Console…" : label}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
