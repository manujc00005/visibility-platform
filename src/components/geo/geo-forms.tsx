"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { GeoFormState } from "@/app/workspaces/[id]/geo/actions";
import type { Messages } from "@/i18n/messages";

/**
 * GEO forms. Client components: every text arrives by props as a serializable fragment of
 * the catalog (strings only, D015); they never import the catalog or the GEO labels module.
 */
export type GeoFormLabels = Messages["geo"]["forms"];
export type IntentLabels = Messages["geo"]["labels"]["intent"];

type Action = (state: GeoFormState, formData: FormData) => Promise<GeoFormState>;
const initial: GeoFormState = { ok: false, message: null, errors: [], values: {}, attempt: 0 };

function Feedback({ state }: { state: GeoFormState }) {
  if (!state.message) return null;
  return (
    <div role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}>
      {state.message}
      {state.errors.length ? <ul className="mt-1 list-disc pl-5">{state.errors.map((e) => <li key={e}>{e}</li>)}</ul> : null}
    </div>
  );
}

/** Shared shell: re-mounts fields with the submitted values after an error, so nothing typed is lost. */
function GeoForm({
  action,
  submit,
  pendingLabel,
  children,
}: {
  action: Action;
  submit: string;
  pendingLabel: string;
  children: (v: Record<string, string>) => ReactNode;
}) {
  const [state, formAction, pending] = useActionState(action, initial);
  const v = state.ok ? {} : state.values;
  return (
    <form key={state.attempt} action={formAction} className="flex flex-col gap-3">
      {children(v)}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? pendingLabel : submit}
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function AliasesForm({ action, defaultAliases, labels }: { action: Action; defaultAliases: string[]; labels: GeoFormLabels }) {
  const t = labels.aliases;
  return (
    <GeoForm action={action} submit={t.submit} pendingLabel={labels.saving}>
      {(v) => (
        <div className="flex flex-col gap-2">
          <Label htmlFor="aliases">{t.label}</Label>
          <Textarea id="aliases" name="aliases" rows={3} defaultValue={v.aliases ?? defaultAliases.join("\n")} placeholder={t.placeholder} />
          <p className="text-xs text-muted-foreground">{t.hint}</p>
        </div>
      )}
    </GeoForm>
  );
}

export function CompetitorForm({ action, labels }: { action: Action; labels: GeoFormLabels }) {
  const t = labels.competitor;
  return (
    <GeoForm action={action} submit={t.submit} pendingLabel={labels.saving}>
      {(v) => (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="c-name">{t.name}</Label>
            <Input id="c-name" name="name" defaultValue={v.name} required maxLength={120} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="c-website">{t.website}</Label>
            <Input id="c-website" name="website" defaultValue={v.website} inputMode="url" placeholder={t.websitePlaceholder} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="c-aliases">{t.aliases}</Label>
            <Input id="c-aliases" name="aliases" defaultValue={v.aliases} placeholder={t.aliasesPlaceholder} />
          </div>
        </div>
      )}
    </GeoForm>
  );
}

export function PromptForm({ action, labels, intents }: { action: Action; labels: GeoFormLabels; intents: IntentLabels }) {
  const t = labels.prompt;
  return (
    <GeoForm action={action} submit={t.submit} pendingLabel={labels.saving}>
      {(v) => (
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <div className="flex flex-col gap-2">
            <Label htmlFor="p-text">{t.text}</Label>
            {/* The example is a market question: it stays in the business's language (SPEC «Límites»). */}
            <Input id="p-text" name="text" defaultValue={v.text} required maxLength={400} placeholder={t.placeholder} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="p-intent">{t.intent}</Label>
            <select id="p-intent" name="intent" defaultValue={v.intent ?? "discovery"} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
              {Object.entries(intents).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </GeoForm>
  );
}

export function RunForm({ action, paid, labels }: { action: Action; paid: { available: boolean; reason: string | null }; labels: GeoFormLabels }) {
  const t = labels.run;
  return (
    <GeoForm action={action} submit={t.submit} pendingLabel={t.pending}>
      {(v) => (
        <div className="flex flex-col gap-3 text-sm">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">{t.legend}</legend>
            <label className="flex items-start gap-2">
              <input type="radio" name="provider" value="manual" defaultChecked={(v.provider ?? "manual") === "manual"} />
              <span>
                <strong>{t.manualTitle}</strong> {t.manualBody}
              </span>
            </label>
            <label className={`flex items-start gap-2 ${paid.available ? "" : "opacity-60"}`}>
              <input type="radio" name="provider" value="dataforseo_chatgpt" disabled={!paid.available} defaultChecked={v.provider === "dataforseo_chatgpt"} />
              <span>
                <strong>{t.paidTitle}</strong> {t.paidBody}
                {paid.reason ? <span className="block text-xs text-muted-foreground">{paid.reason}</span> : null}
              </span>
            </label>
          </fieldset>
          <div className="flex items-center gap-2">
            <Label htmlFor="repetitions">{t.repetitions}</Label>
            <select id="repetitions" name="repetitions" defaultValue={v.repetitions ?? "1"} className="h-8 rounded-lg border border-input bg-transparent px-2.5">
              {[1, 2, 3].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
          </div>
        </div>
      )}
    </GeoForm>
  );
}

export function ManualObservationForm({ action, labels }: { action: Action; labels: GeoFormLabels }) {
  const t = labels.observation;
  return (
    <GeoForm action={action} submit={t.submit} pendingLabel={labels.saving}>
      {(v) => (
        <div className="flex flex-col gap-2">
          <Label className="sr-only">{t.label}</Label>
          <Textarea name="answer" rows={5} defaultValue={v.answer} placeholder={t.answerPlaceholder} aria-label={t.answerLabel} />
          <Textarea name="sources" rows={2} defaultValue={v.sources} placeholder={t.sourcesPlaceholder} aria-label={t.sourcesLabel} />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="noAnswer" value="true" defaultChecked={v.noAnswer === "true"} /> {t.noAnswer}
          </label>
        </div>
      )}
    </GeoForm>
  );
}

export function RefreshRunButton({ action, labels }: { action: (state: GeoFormState) => Promise<GeoFormState>; labels: GeoFormLabels }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? labels.refresh.pending : labels.refresh.submit}
      </Button>
      <Feedback state={state} />
    </form>
  );
}
