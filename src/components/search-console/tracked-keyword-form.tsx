"use client";

import { useActionState, useId } from "react";
import type { KeywordActionState } from "@/app/workspaces/[id]/seo/actions";
import { Button } from "@/components/ui/button";

const INITIAL: KeywordActionState = { error: null, value: "", revision: 0 };
type Action = (state: KeywordActionState, form: FormData) => Promise<KeywordActionState>;

export function TrackedKeywordForm({ action, labels }: { action: Action; labels: { label: string; add: string; pendingAction: string } }) {
  const [state, submit, pending] = useActionState(action, INITIAL);
  const id = useId();
  return (
    <form action={submit} className="flex min-w-0 flex-col items-start gap-2">
      <label htmlFor={id} className="text-sm font-medium">
        {labels.label}
      </label>
      <div className="flex w-full min-w-0 flex-wrap gap-2">
        {/* The key resets the field after a success and restores the typed value after an error. */}
        <input
          key={`${state.revision}:${state.value}`}
          id={id}
          name="keyword"
          defaultValue={state.value}
          required
          maxLength={1000}
          disabled={pending}
          aria-invalid={Boolean(state.error)}
          aria-describedby={state.error ? `${id}-error` : undefined}
          className="min-w-0 flex-1 rounded-md border bg-background px-3 py-2 text-sm"
        />
        <Button type="submit" disabled={pending}>
          {pending ? labels.pendingAction : labels.add}
        </Button>
      </div>
      {state.error ? (
        <p id={`${id}-error`} role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}

export function RemoveTrackedKeywordForm({ action, label, pendingLabel, keyword }: { action: Action; label: string; pendingLabel: string; keyword: string }) {
  const [state, submit, pending] = useActionState(action, INITIAL);
  return (
    <form action={submit} className="flex flex-col items-start gap-1">
      <Button type="submit" variant="outline" size="sm" disabled={pending} aria-label={`${label}: ${keyword}`}>
        {pending ? pendingLabel : label}
      </Button>
      {state.error ? (
        <p role="alert" className="text-sm text-destructive">
          {state.error}
        </p>
      ) : null}
    </form>
  );
}
