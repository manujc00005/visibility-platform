"use client";

import Link from "next/link";
import { useActionState } from "react";
import { Button, buttonVariants } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { WorkspaceFormState } from "@/app/workspaces/actions";
import type { Messages } from "@/i18n/messages";
import type { WorkspaceField, WorkspaceFormValues } from "@/modules/workspaces/validation";

type Action = (state: WorkspaceFormState, formData: FormData) => Promise<WorkspaceFormState>;

/** Labels of the form: a serializable fragment of the catalog (strings only), passed by the page. */
export type WorkspaceFormLabels = Messages["workspaces"]["form"];

interface Props {
  action: Action;
  initialValues: WorkspaceFormValues;
  countries: { code: string; name: string }[];
  labels: WorkspaceFormLabels;
  submitLabel: string;
  cancelHref: string;
}

function FieldError({ id, messages }: { id: string; messages?: string[] }) {
  if (!messages?.length) return null;
  return (
    <p id={id} className="text-sm text-destructive">
      {messages.join(" ")}
    </p>
  );
}

export function WorkspaceForm({ action, initialValues, countries, labels, submitLabel, cancelHref }: Props) {
  const [state, formAction, pending] = useActionState(action, {
    values: initialValues,
    fieldErrors: {},
    duplicateOf: null,
    formError: null,
    attempt: 0,
  });
  const { values, fieldErrors } = state;
  const invalid = (field: WorkspaceField) => (fieldErrors[field]?.length ? true : undefined);
  const describedBy = (field: WorkspaceField, hint?: string) =>
    [fieldErrors[field]?.length ? `${field}-error` : null, hint].filter(Boolean).join(" ") || undefined;
  const hasErrors = Object.keys(fieldErrors).length > 0 || state.formError !== null;
  const countryKnown = countries.some((c) => c.code === values.country.toUpperCase());

  return (
    // `key` remounts the uncontrolled fields with the values returned after a failed submit.
    <form key={state.attempt} action={formAction} noValidate className="flex max-w-2xl flex-col gap-5">
      {hasErrors ? (
        <div role="alert" className="rounded-md border border-destructive/40 bg-destructive/5 p-3 text-sm text-destructive">
          {state.formError ?? labels.reviewFields}
          {state.duplicateOf ? (
            <>
              {" "}
              <Link href={`/workspaces/${state.duplicateOf}`} className="underline">
                {labels.viewExisting}
              </Link>
            </>
          ) : null}
        </div>
      ) : null}

      <div className="flex flex-col gap-2">
        <Label htmlFor="name">{labels.name}</Label>
        <Input id="name" name="name" defaultValue={values.name} required maxLength={120} aria-invalid={invalid("name")} aria-describedby={describedBy("name")} />
        <FieldError id="name-error" messages={fieldErrors.name} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="website">{labels.website}</Label>
        <Input
          id="website"
          name="website"
          defaultValue={values.website}
          required
          inputMode="url"
          autoCapitalize="none"
          spellCheck={false}
          placeholder={labels.websitePlaceholder}
          aria-invalid={invalid("website")}
          aria-describedby={describedBy("website", "website-hint")}
        />
        <p id="website-hint" className="text-sm text-muted-foreground">
          {labels.websiteHint}
        </p>
        <FieldError id="website-error" messages={fieldErrors.website} />
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="sector">{labels.sector}</Label>
        <Input id="sector" name="sector" defaultValue={values.sector} required maxLength={80} placeholder={labels.sectorPlaceholder} aria-invalid={invalid("sector")} aria-describedby={describedBy("sector")} />
        <FieldError id="sector-error" messages={fieldErrors.sector} />
      </div>

      <div className="grid gap-5 sm:grid-cols-2">
        <div className="flex flex-col gap-2">
          <Label htmlFor="country">{labels.country}</Label>
          <select
            id="country"
            name="country"
            defaultValue={values.country.toUpperCase()}
            required
            aria-invalid={invalid("country")}
            aria-describedby={describedBy("country")}
            className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 aria-invalid:border-destructive"
          >
            {!countryKnown && values.country ? <option value={values.country}>{values.country}</option> : null}
            {countries.map((country) => (
              <option key={country.code} value={country.code}>
                {country.name}
              </option>
            ))}
          </select>
          <FieldError id="country-error" messages={fieldErrors.country} />
        </div>

        <div className="flex flex-col gap-2">
          <Label htmlFor="city">
            {labels.city} <span className="font-normal text-muted-foreground">{labels.optional}</span>
          </Label>
          <Input id="city" name="city" defaultValue={values.city} maxLength={120} aria-invalid={invalid("city")} aria-describedby={describedBy("city")} />
          <FieldError id="city-error" messages={fieldErrors.city} />
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <Label htmlFor="services">{labels.services}</Label>
        <Textarea
          id="services"
          name="services"
          defaultValue={values.services}
          required
          rows={4}
          placeholder={labels.servicesPlaceholder}
          aria-invalid={invalid("services")}
          aria-describedby={describedBy("services", "services-hint")}
        />
        <p id="services-hint" className="text-sm text-muted-foreground">
          {labels.servicesHint}
        </p>
        <FieldError id="services-error" messages={fieldErrors.services} />
      </div>

      <div className="flex items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? labels.saving : submitLabel}
        </Button>
        <Link href={cancelHref} className={buttonVariants({ variant: "ghost" })}>
          {labels.cancel}
        </Link>
      </div>
    </form>
  );
}
