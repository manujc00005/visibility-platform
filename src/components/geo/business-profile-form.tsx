"use client";

import { useActionState } from "react";
import type { GeoFormState } from "@/app/workspaces/[id]/geo/actions";
import { SELECT_CLASS } from "@/components/geo/competitor-suggestions";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { Messages } from "@/i18n/messages";
import { COMPETITOR_KINDS, CUSTOMER_TYPES, PROFILE_LIMITS, ZONE_RELEVANCES } from "@/modules/geo/competitors/profile-options";
import type { GeoBusinessProfile } from "@/modules/geo/competitors/schema";

type FormAction = (state: GeoFormState, formData: FormData) => Promise<GeoFormState>;

const initial: GeoFormState = { ok: false, message: null, errors: [], values: {}, attempt: 0 };

/**
 * One form, two buttons: the proposal only fills the fields from the home page, saving is what
 * confirms them. Values from a proposal or a failed save win over the stored profile.
 */
export function BusinessProfileForm({
  profile,
  propose,
  save,
  labels,
}: {
  profile: GeoBusinessProfile | null;
  propose: FormAction;
  save: FormAction;
  labels: Messages["geo"]["profile"]["form"];
}) {
  const t = labels;
  const run: FormAction = (state, formData) => (formData.get("intent") === "propose" ? propose(state, formData) : save(state, formData));
  const [state, action, pending] = useActionState(run, initial);
  const v = state.values;
  const kinds: string[] = v.competitorKinds !== undefined ? v.competitorKinds.split(",") : (profile?.competitorKinds ?? ["direct", "indirect"]);
  return (
    <section aria-labelledby="profile-title" className="flex flex-col gap-3 border-t pt-4">
      <div>
        <h3 id="profile-title" className="text-sm font-medium">
          {t.title}
        </h3>
        <p className="text-xs text-muted-foreground">{t.description}</p>
      </div>
      <form key={state.attempt} action={action} className="grid gap-3 sm:grid-cols-2">
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="p-summary">{t.summary}</Label>
          <Textarea id="p-summary" name="summary" rows={2} defaultValue={v.summary ?? profile?.summary ?? ""} maxLength={PROFILE_LIMITS.summary} />
        </div>
        <div className="flex flex-col gap-1.5 sm:col-span-2">
          <Label htmlFor="p-offerings">{t.offerings}</Label>
          <Textarea id="p-offerings" name="offerings" rows={4} defaultValue={v.offerings ?? profile?.offerings.join("\n") ?? ""} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-customer">{t.customerType}</Label>
          <select id="p-customer" name="customerType" defaultValue={v.customerType ?? profile?.customerType ?? "both"} className={SELECT_CLASS}>
            {CUSTOMER_TYPES.map((type) => (
              <option key={type} value={type}>
                {t.customerTypes[type]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-target">{t.targetCustomer}</Label>
          <Input id="p-target" name="targetCustomer" defaultValue={v.targetCustomer ?? profile?.targetCustomer ?? ""} maxLength={PROFILE_LIMITS.targetCustomer} placeholder={t.targetPlaceholder} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-zone">{t.zoneRelevance}</Label>
          <select id="p-zone" name="zoneRelevance" defaultValue={v.zoneRelevance ?? profile?.zoneRelevance ?? "national"} className={SELECT_CLASS}>
            {ZONE_RELEVANCES.map((zone) => (
              <option key={zone} value={zone}>
                {t.zones[zone]}
              </option>
            ))}
          </select>
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="p-area">{t.servedArea}</Label>
          <Input id="p-area" name="servedArea" defaultValue={v.servedArea ?? profile?.servedArea ?? ""} maxLength={PROFILE_LIMITS.servedArea} />
          <span className="text-xs text-muted-foreground">{t.servedAreaHint}</span>
        </div>
        <fieldset className="flex flex-col gap-1.5 sm:col-span-2">
          <legend className="text-sm font-medium">{t.kinds}</legend>
          {COMPETITOR_KINDS.map((kind) => (
            <label key={kind} className="flex items-start gap-2 text-sm">
              <input type="checkbox" name="competitorKinds" value={kind} defaultChecked={kinds.includes(kind)} className="mt-1" />
              <span>{t.kindOptions[kind]}</span>
            </label>
          ))}
        </fieldset>
        <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
          <Button type="submit" name="intent" value="save" disabled={pending}>
            {pending ? t.saving : t.save}
          </Button>
          <Button type="submit" name="intent" value="propose" variant="outline" disabled={pending}>
            {pending ? t.proposing : t.propose}
          </Button>
        </div>
      </form>
      {state.message ? (
        <div role={state.ok ? "status" : "alert"} className={`text-sm ${state.ok ? "text-muted-foreground" : "text-destructive"}`}>
          {state.message}
          {[...state.errors, ...(state.notes ?? [])].length > 0 ? (
            <ul className="mt-1 list-disc pl-5">
              {[...state.errors, ...(state.notes ?? [])].map((line) => (
                <li key={line}>{line}</li>
              ))}
            </ul>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
