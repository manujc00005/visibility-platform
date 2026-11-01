"use client";

import { useActionState } from "react";
import type { GoalFormState } from "@/app/workspaces/[id]/goal/actions";
import { SELECT_CLASS } from "@/components/geo/competitor-suggestions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import type { Messages } from "@/i18n/messages";
import {
  GOAL_KINDS,
  GOAL_LIMITS,
  type WorkspaceGoal,
} from "@/modules/goals/schema";

type SaveAction = (
  state: GoalFormState,
  formData: FormData,
) => Promise<GoalFormState>;
type RemoveAction = (state: GoalFormState) => Promise<GoalFormState>;

const initial: GoalFormState = {
  ok: false,
  message: null,
  errors: [],
  values: {},
  attempt: 0,
};

/**
 * The commercial goal of a company (feature 016). Client leaf: every text arrives by props as a
 * serializable fragment of the catalog (D015 of 003). The event is chosen among the key events
 * GA4 returned in the latest capture; without any, it is typed.
 */
export function GoalForm({
  goal,
  currentText,
  configuredEvents,
  save,
  remove,
  labels,
  kinds,
}: {
  goal: WorkspaceGoal | null;
  /** «Objetivo actual: …», built on the server (the client fragment holds strings only). */
  currentText: string | null;
  configuredEvents: string[];
  save: SaveAction;
  remove: RemoveAction;
  labels: Messages["goals"]["form"];
  kinds: Messages["goals"]["kinds"];
}) {
  const t = labels;
  const [state, saveAction, saving] = useActionState(save, initial);
  const [removeState, removeAction, removing] = useActionState(remove, initial);
  const v = state.ok ? {} : state.values;
  const feedback = removeState.attempt > state.attempt ? removeState : state;
  const chosenEvent = v.eventName ?? goal?.eventName ?? "";
  // A stored event GA4 no longer lists stays selectable, so the form never silently changes it.
  const options =
    configuredEvents.includes(chosenEvent) || chosenEvent === ""
      ? configuredEvents
      : [chosenEvent, ...configuredEvents];
  return (
    <section aria-labelledby="goal-title" className="flex flex-col gap-3">
      <div className="flex flex-col gap-1">
        <h2 id="goal-title" className="text-lg font-semibold tracking-tight">
          {t.title}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t.description}
        </p>
      </div>
      {currentText ? <p className="text-sm">{currentText}</p> : null}
      <form
        key={state.attempt}
        action={saveAction}
        className="grid max-w-3xl gap-3 sm:grid-cols-3"
      >
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-kind">{t.kind}</Label>
          <select
            id="goal-kind"
            name="kind"
            defaultValue={v.kind ?? goal?.kind ?? "request"}
            className={SELECT_CLASS}
          >
            {GOAL_KINDS.map((kind) => (
              <option key={kind} value={kind}>
                {kinds[kind]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-label">{t.label}</Label>
          <Input
            id="goal-label"
            name="label"
            defaultValue={v.label ?? goal?.label ?? ""}
            placeholder={t.labelPlaceholder}
            maxLength={GOAL_LIMITS.label}
            required
          />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="goal-event">{t.event}</Label>
          {options.length > 0 ? (
            <select
              id="goal-event"
              name="eventName"
              defaultValue={chosenEvent || options[0]}
              className={SELECT_CLASS}
            >
              {options.map((event) => (
                <option key={event} value={event}>
                  {event}
                </option>
              ))}
            </select>
          ) : (
            <Input
              id="goal-event"
              name="eventName"
              defaultValue={chosenEvent}
              maxLength={GOAL_LIMITS.event}
              required
            />
          )}
          <p className="text-xs text-muted-foreground">
            {options.length > 0 ? t.eventHint : t.eventFreeHint}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-3">
          <Button type="submit" disabled={saving || removing}>
            {saving ? t.saving : t.submit}
          </Button>
          {feedback.message ? (
            <div
              role={feedback.ok ? "status" : "alert"}
              className={`text-sm ${feedback.ok ? "text-muted-foreground" : "text-destructive"}`}
            >
              {feedback.message}
              {feedback.errors.length ? (
                <ul className="mt-1 list-disc pl-5">
                  {feedback.errors.map((e) => (
                    <li key={e}>{e}</li>
                  ))}
                </ul>
              ) : null}
            </div>
          ) : null}
        </div>
      </form>
      {goal ? (
        <form action={removeAction}>
          <Button type="submit" variant="outline" disabled={saving || removing}>
            {removing ? t.removing : t.remove}
          </Button>
        </form>
      ) : null}
    </section>
  );
}
