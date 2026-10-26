"use client";

import { useActionState, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { GeoFormState } from "@/app/workspaces/[id]/geo/actions";
import { INTENT_LABELS } from "@/modules/geo/presentation";

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
function GeoForm({ action, submit, pendingLabel, children }: { action: Action; submit: string; pendingLabel?: string; children: (v: Record<string, string>) => ReactNode }) {
  const [state, formAction, pending] = useActionState(action, initial);
  const v = state.ok ? {} : state.values;
  return (
    <form key={state.attempt} action={formAction} className="flex flex-col gap-3">
      {children(v)}
      <div className="flex flex-wrap items-center gap-3">
        <Button type="submit" disabled={pending}>
          {pending ? (pendingLabel ?? "Guardando…") : submit}
        </Button>
        <Feedback state={state} />
      </div>
    </form>
  );
}

export function AliasesForm({ action, defaultAliases }: { action: Action; defaultAliases: string[] }) {
  return (
    <GeoForm action={action} submit="Guardar alias">
      {(v) => (
        <div className="flex flex-col gap-2">
          <Label htmlFor="aliases">Otros nombres de la marca</Label>
          <Textarea id="aliases" name="aliases" rows={3} defaultValue={v.aliases ?? defaultAliases.join("\n")} placeholder={"Otro nombre comercial\nSiglas"} />
          <p className="text-xs text-muted-foreground">Uno por línea. Se buscan como palabras completas; evita términos genéricos («Centro», «Clínica»).</p>
        </div>
      )}
    </GeoForm>
  );
}

export function CompetitorForm({ action }: { action: Action }) {
  return (
    <GeoForm action={action} submit="Añadir competidor">
      {(v) => (
        <div className="grid gap-3 sm:grid-cols-3">
          <div className="flex flex-col gap-2">
            <Label htmlFor="c-name">Nombre</Label>
            <Input id="c-name" name="name" defaultValue={v.name} required maxLength={120} />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="c-website">Web (opcional)</Label>
            <Input id="c-website" name="website" defaultValue={v.website} inputMode="url" placeholder="competidor.es" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="c-aliases">Otros nombres (opcional)</Label>
            <Input id="c-aliases" name="aliases" defaultValue={v.aliases} placeholder="Uno solo" />
          </div>
        </div>
      )}
    </GeoForm>
  );
}


export function PromptForm({ action }: { action: Action }) {
  return (
    <GeoForm action={action} submit="Añadir pregunta">
      {(v) => (
        <div className="grid gap-3 sm:grid-cols-[1fr_12rem]">
          <div className="flex flex-col gap-2">
            <Label htmlFor="p-text">Pregunta</Label>
            <Input id="p-text" name="text" defaultValue={v.text} required maxLength={400} placeholder="¿Qué clínica dental me recomiendas en Valladolid?" />
          </div>
          <div className="flex flex-col gap-2">
            <Label htmlFor="p-intent">Tipo</Label>
            <select id="p-intent" name="intent" defaultValue={v.intent ?? "discovery"} className="h-8 rounded-lg border border-input bg-transparent px-2.5 text-sm">
              {Object.entries(INTENT_LABELS).map(([value, label]) => (
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

export function RunForm({ action, paid }: { action: Action; paid: { available: boolean; reason: string | null } }) {
  return (
    <GeoForm action={action} submit="Iniciar medición" pendingLabel="Iniciando…">
      {(v) => (
        <div className="flex flex-col gap-3 text-sm">
          <fieldset className="flex flex-col gap-2">
            <legend className="mb-1 font-medium">Cómo se obtienen las respuestas</legend>
            <label className="flex items-start gap-2">
              <input type="radio" name="provider" value="manual" defaultChecked={(v.provider ?? "manual") === "manual"} />
              <span>
                <strong>Captura asistida</strong> (sin coste): haces cada pregunta en ChatGPT y pegas aquí la respuesta y sus fuentes.
              </span>
            </label>
            <label className={`flex items-start gap-2 ${paid.available ? "" : "opacity-60"}`}>
              <input type="radio" name="provider" value="dataforseo_chatgpt" disabled={!paid.available} defaultChecked={v.provider === "dataforseo_chatgpt"} />
              <span>
                <strong>Automática con DataForSEO</strong> (de pago, 0,0012 USD por respuesta; resultados en hasta 45 min).
                {paid.reason ? <span className="block text-xs text-muted-foreground">{paid.reason}</span> : null}
              </span>
            </label>
          </fieldset>
          <div className="flex items-center gap-2">
            <Label htmlFor="repetitions">Repeticiones por pregunta (solo automática)</Label>
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

export function ManualObservationForm({ action }: { action: Action }) {
  return (
    <GeoForm action={action} submit="Guardar respuesta">
      {(v) => (
        <div className="flex flex-col gap-2">
          <Label className="sr-only">Respuesta</Label>
          <Textarea name="answer" rows={5} defaultValue={v.answer} placeholder="Pega aquí la respuesta completa de ChatGPT" aria-label="Respuesta de ChatGPT" />
          <Textarea name="sources" rows={2} defaultValue={v.sources} placeholder="Fuentes citadas: una URL por línea (opcional)" aria-label="Fuentes citadas" />
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" name="noAnswer" value="true" defaultChecked={v.noAnswer === "true"} /> Sin respuesta (ChatGPT no contestó)
          </label>
        </div>
      )}
    </GeoForm>
  );
}

export function RefreshRunButton({ action }: { action: (state: GeoFormState) => Promise<GeoFormState> }) {
  const [state, formAction, pending] = useActionState(action, initial);
  return (
    <form action={formAction} className="flex flex-wrap items-center gap-3">
      <Button type="submit" variant="outline" disabled={pending}>
        {pending ? "Consultando…" : "Actualizar resultados"}
      </Button>
      <Feedback state={state} />
    </form>
  );
}
