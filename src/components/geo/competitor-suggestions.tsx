"use client";

import { useActionState, useState } from "react";
import type { GeoFormState } from "@/app/workspaces/[id]/geo/actions";
import { StatusPill } from "@/components/audits/status-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import type { FactorEvidence, SuggestionFactors, WebStatus } from "@/modules/geo/competitors/schema";
import type { Tone } from "@/modules/audits/status";

/**
 * Operator-facing discovery flow: copy a question, paste ChatGPT's answer and sources,
 * review cards with indicators and doubts, correct name/web, confirm or dismiss.
 * Everything rendered here is text: names, snippets and URLs from the capture are never
 * interpreted as markup. Only the extraction action reads the web; cards never do.
 */

export interface SuggestionCard {
  id: string;
  status: "suggested" | "accepted" | "dismissed" | "superseded";
  name: string;
  domain: string | null;
  sourceUrls: string[];
  snippet: string;
  pageTitle: string | null;
  pageDescription: string | null;
  factors: SuggestionFactors;
  webStatus: WebStatus | null;
  finalUrl: string | null;
  acceptedName: string | null;
}

export interface ExtractionSummary {
  question: string;
  capturedAt: string;
  sourcesCount: number;
  candidatesTotal: number;
  warnings: string[];
  /** Company record frozen at extraction time, as text. */
  context: string;
  rulesVersion: string;
}

type FormAction = (state: GeoFormState, formData: FormData) => Promise<GeoFormState>;
type ButtonAction = (state: GeoFormState) => Promise<GeoFormState>;
/** Server actions as exported by the actions module; they are bound here, in the client. */
export type AcceptAction = (workspaceId: string, suggestionId: string, state: GeoFormState, formData: FormData) => Promise<GeoFormState>;
export type DismissAction = (workspaceId: string, suggestionId: string, state: GeoFormState) => Promise<GeoFormState>;
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

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      onClick={async () => {
        try {
          await navigator.clipboard.writeText(text);
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        } catch {
          setCopied(false);
        }
      }}
      aria-label={`Copiar la pregunta: ${text}`}
    >
      {copied ? "Copiada" : "Copiar"}
    </Button>
  );
}

const FACTOR_TONE: Record<FactorEvidence["state"], Tone> = { matched: "good", unknown: "neutral", conflicting: "bad" };
const FACTOR_LABEL: Record<FactorEvidence["state"], string> = { matched: "Indicio", unknown: "Sin indicios", conflicting: "Contradice" };
const WEB_LABEL: Record<WebStatus, { tone: Tone; text: string }> = {
  reachable: { tone: "good", text: "La web responde (no prueba que sea suya)" },
  unreachable: { tone: "fair", text: "La web no respondió" },
  unverified: { tone: "neutral", text: "Web sin comprobar" },
  blocked: { tone: "bad", text: "Destino no público" },
};

function Factor({ label, factor }: { label: string; factor: FactorEvidence }) {
  return (
    <li className="flex flex-wrap items-baseline gap-2">
      <StatusPill tone={FACTOR_TONE[factor.state]}>{`${label}: ${FACTOR_LABEL[factor.state]}`}</StatusPill>
      <span className="text-xs text-muted-foreground">{factor.reason}</span>
    </li>
  );
}

function Card({ card, workspaceId, accept, dismiss, canAdd, limitReason }: { card: SuggestionCard; workspaceId: string; accept: AcceptAction; dismiss: DismissAction; canAdd: boolean; limitReason: string }) {
  const boundAccept: FormAction = accept.bind(null, workspaceId, card.id);
  const boundDismiss: ButtonAction = dismiss.bind(null, workspaceId, card.id);
  const [acceptState, acceptAction, accepting] = useActionState(boundAccept, initial);
  const [dismissState, dismissAction, dismissing] = useActionState(boundDismiss, initial);
  const v = acceptState.ok ? {} : acceptState.values;
  const decided = card.status !== "suggested";
  const web = card.webStatus ? WEB_LABEL[card.webStatus] : null;
  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium break-words">{card.name}</p>
          {card.domain ? <p className="font-mono text-xs break-all text-muted-foreground">{card.domain}</p> : <p className="text-xs text-muted-foreground">Sin web asociada</p>}
        </div>
        {card.status === "accepted" ? <StatusPill tone="good">Añadido{card.acceptedName && card.acceptedName !== card.name ? ` como ${card.acceptedName}` : ""}</StatusPill> : null}
        {card.status === "dismissed" ? <StatusPill tone="neutral">Descartado</StatusPill> : null}
      </div>

      <ul className="flex flex-col gap-1">
        <Factor label="Sector" factor={card.factors.sector} />
        <Factor label="Zona" factor={card.factors.zone} />
        <Factor label="Servicios" factor={card.factors.services} />
        {web ? (
          <li>
            <StatusPill tone={web.tone}>{web.text}</StatusPill>
          </li>
        ) : null}
      </ul>

      {card.pageTitle || card.pageDescription ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">Su portada dice: </span>
          {[card.pageTitle, card.pageDescription].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {card.snippet ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">En la respuesta: </span>
          {card.snippet}
        </p>
      ) : null}
      {card.sourceUrls.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">URLs citadas: </span>
          <span className="font-mono break-all">{card.sourceUrls.join("  ")}</span>
        </p>
      ) : null}
      {card.factors.review.length > 0 && !decided ? (
        <ul className="list-disc pl-5 text-xs text-fair">
          {card.factors.review.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      {!decided ? (
        <div className="flex flex-col gap-3 border-t pt-3">
          <form key={acceptState.attempt} action={acceptAction} className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`s-name-${card.id}`}>Nombre</Label>
              <Input id={`s-name-${card.id}`} name="name" defaultValue={v.name ?? card.name} required maxLength={120} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`s-web-${card.id}`}>Web (opcional)</Label>
              <Input id={`s-web-${card.id}`} name="website" defaultValue={v.website ?? card.domain ?? ""} inputMode="url" placeholder="competidor.es" />
              <span className="text-xs text-muted-foreground">Si la cambias, se guarda como aportada por ti y sin comprobar.</span>
            </div>
            <label className="flex items-start gap-2 sm:col-span-2">
              <input type="checkbox" name="reviewConfirmed" value="true" defaultChecked={v.reviewConfirmed === "true"} required className="mt-1" />
              <span>He revisado este candidato y confirmo que es un competidor de esta empresa.</span>
            </label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button type="submit" disabled={accepting || !canAdd} title={canAdd ? undefined : limitReason}>
                {accepting ? "Añadiendo…" : "Añadir como competidor"}
              </Button>
              {!canAdd ? <span className="text-xs text-muted-foreground">{limitReason}</span> : null}
              <Feedback state={acceptState} />
            </div>
          </form>
          <form action={dismissAction} className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="ghost" size="sm" disabled={dismissing}>
              {dismissing ? "Descartando…" : "Descartar"}
            </Button>
            <Feedback state={dismissState} />
          </form>
        </div>
      ) : null}
    </li>
  );
}

export function CompetitorSuggestions({
  workspaceId,
  questions,
  extraction,
  cards,
  activeCount,
  maxActive,
  extract,
  accept,
  dismiss,
}: {
  workspaceId: string;
  questions: string[];
  extraction: ExtractionSummary | null;
  cards: SuggestionCard[];
  activeCount: number;
  maxActive: number;
  extract: FormAction;
  accept: AcceptAction;
  dismiss: DismissAction;
}) {
  const [state, formAction, pending] = useActionState(extract, initial);
  const v = state.ok ? {} : state.values;
  const canAdd = activeCount < maxActive;
  const limitReason = `Ya hay ${maxActive} competidores activos; quita uno para añadir otro.`;
  const pendingCards = cards.filter((c) => c.status === "suggested");
  const decidedCards = cards.filter((c) => c.status === "accepted" || c.status === "dismissed");

  return (
    <section aria-labelledby="suggestions-title" className="flex flex-col gap-4 border-t pt-4">
      <div>
        <h3 id="suggestions-title" className="text-sm font-medium">
          Sugerencias a partir de ChatGPT
        </h3>
        <p className="text-xs text-muted-foreground">
          Haz una de estas preguntas en ChatGPT, pega la respuesta y las webs que cite. Nosotros extraemos candidatos y señalamos indicios y dudas; tú decides.
        </p>
      </div>

      <ol className="flex flex-col gap-2 text-sm">
        {questions.map((q) => (
          <li key={q} className="flex flex-wrap items-center gap-2">
            <CopyButton text={q} />
            <span>{q}</span>
          </li>
        ))}
      </ol>

      <form key={state.attempt} action={formAction} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="d-question">Pregunta que hiciste</Label>
          <Input id="d-question" name="question" defaultValue={v.question ?? questions[0] ?? ""} required maxLength={500} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="d-answer">Respuesta de ChatGPT</Label>
          <Textarea id="d-answer" name="answer" rows={6} defaultValue={v.answer} required placeholder="Pega aquí la respuesta completa" />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="d-sources">Webs citadas (una URL por línea, opcional)</Label>
          <Textarea id="d-sources" name="sources" rows={3} defaultValue={v.sources} placeholder={"https://competidor.es/\nhttps://otro.es/"} />
          <span className="text-xs text-muted-foreground">Solo se lee la portada de cada web citada. No se guarda la respuesta completa, solo fragmentos.</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? "Extrayendo y comprobando webs…" : "Extraer competidores"}
          </Button>
          <Feedback state={state} />
        </div>
      </form>

      {extraction ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            Respuesta de ChatGPT aportada por el operador · capturada el {extraction.capturedAt} · pregunta: «{extraction.question}» · {extraction.sourcesCount}{" "}
            {extraction.sourcesCount === 1 ? "web citada" : "webs citadas"} · {extraction.candidatesTotal} {extraction.candidatesTotal === 1 ? "candidato" : "candidatos"} analizados
          </p>
          <p className="text-xs text-muted-foreground">
            Ficha usada en la evaluación: {extraction.context} · reglas <span className="font-mono">{extraction.rulesVersion}</span>
          </p>
          {extraction.warnings.length > 0 ? (
            <ul className="list-disc pl-5 text-xs text-muted-foreground">
              {extraction.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          {pendingCards.length === 0 && decidedCards.length === 0 ? (
            <p className="rounded-lg border p-3 text-sm text-muted-foreground">
              No hay candidatos que mostrar. {extraction.warnings.length > 0 ? "Los motivos están arriba." : ""} Puedes repetir la pregunta pidiendo a ChatGPT que incluya las webs, o añadir competidores a mano.
            </p>
          ) : null}
          {pendingCards.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {pendingCards.map((card) => (
                <Card key={card.id} card={card} workspaceId={workspaceId} accept={accept} dismiss={dismiss} canAdd={canAdd} limitReason={limitReason} />
              ))}
            </ul>
          ) : null}
          {decidedCards.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">Decididos en esta extracción ({decidedCards.length})</summary>
              <ul className="mt-2 flex flex-col gap-3">
                {decidedCards.map((card) => (
                  <Card key={card.id} card={card} workspaceId={workspaceId} accept={accept} dismiss={dismiss} canAdd={canAdd} limitReason={limitReason} />
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
