"use client";

import { useActionState, useState } from "react";
import type { GeoFormState } from "@/app/workspaces/[id]/geo/actions";
import { StatusPill } from "@/components/audits/status-ui";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { fillTemplate, plural } from "@/i18n/client-format";
import type { Locale } from "@/i18n/locale";
import type { Messages } from "@/i18n/messages";
import type { FactorEvidence, SuggestionFactors, WebStatus } from "@/modules/geo/competitors/schema";
import type { Tone } from "@/modules/audits/status";

/**
 * Operator-facing discovery flow: copy a question, paste ChatGPT's answer and sources,
 * review cards with indicators and doubts, correct name/web, confirm or dismiss.
 * Everything rendered here is text: names, snippets and URLs from the capture are never
 * interpreted as markup. Only the extraction action reads the web; cards never do.
 *
 * Texts arrive by props (`labels`, a serializable catalog fragment, D015). Values known only
 * here (accepted name, active limit, counts) use `client-format` templates and plurals. The
 * warnings, factor reasons and review notes come stored in Spanish and are shown as recorded.
 */
export type SuggestionLabels = Messages["geo"]["suggestions"];

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
  /** Single notice that stored texts are shown as recorded (only outside Spanish), or null. */
  notice: string | null;
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

function CopyButton({ text, labels }: { text: string; labels: SuggestionLabels }) {
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
      aria-label={fillTemplate(labels.copyLabel, { question: text })}
    >
      {copied ? labels.copied : labels.copy}
    </Button>
  );
}

const FACTOR_TONE: Record<FactorEvidence["state"], Tone> = { matched: "good", unknown: "neutral", conflicting: "bad" };
const WEB_TONE: Record<WebStatus, Tone> = { reachable: "good", unreachable: "fair", unverified: "neutral", blocked: "bad" };

function Factor({ label, factor, states, pill }: { label: string; factor: FactorEvidence; states: SuggestionLabels["card"]["factor"]; pill: string }) {
  return (
    <li className="flex flex-wrap items-baseline gap-2">
      <StatusPill tone={FACTOR_TONE[factor.state]}>{fillTemplate(pill, { label, state: states[factor.state] })}</StatusPill>
      {/* Stored reason, as recorded at extraction time (Spanish). */}
      <span className="text-xs text-muted-foreground" lang="es">
        {factor.reason}
      </span>
    </li>
  );
}

function Card({
  card,
  workspaceId,
  accept,
  dismiss,
  canAdd,
  limitReason,
  labels,
}: {
  card: SuggestionCard;
  workspaceId: string;
  accept: AcceptAction;
  dismiss: DismissAction;
  canAdd: boolean;
  limitReason: string;
  labels: SuggestionLabels;
}) {
  const t = labels.card;
  const boundAccept: FormAction = accept.bind(null, workspaceId, card.id);
  const boundDismiss: ButtonAction = dismiss.bind(null, workspaceId, card.id);
  const [acceptState, acceptAction, accepting] = useActionState(boundAccept, initial);
  const [dismissState, dismissAction, dismissing] = useActionState(boundDismiss, initial);
  const v = acceptState.ok ? {} : acceptState.values;
  const decided = card.status !== "suggested";
  const web = card.webStatus ? { tone: WEB_TONE[card.webStatus], text: t.web[card.webStatus] } : null;
  return (
    <li className="flex flex-col gap-3 rounded-lg border bg-card p-3 text-sm">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="font-medium break-words">{card.name}</p>
          {card.domain ? <p className="font-mono text-xs break-all text-muted-foreground">{card.domain}</p> : <p className="text-xs text-muted-foreground">{t.noWebsite}</p>}
        </div>
        {card.status === "accepted" ? (
          <StatusPill tone="good">{card.acceptedName && card.acceptedName !== card.name ? fillTemplate(t.acceptedAs, { name: card.acceptedName }) : t.accepted}</StatusPill>
        ) : null}
        {card.status === "dismissed" ? <StatusPill tone="neutral">{t.dismissed}</StatusPill> : null}
      </div>

      <ul className="flex flex-col gap-1">
        <Factor label={t.sector} factor={card.factors.sector} states={t.factor} pill={t.factorPill} />
        <Factor label={t.zone} factor={card.factors.zone} states={t.factor} pill={t.factorPill} />
        <Factor label={t.services} factor={card.factors.services} states={t.factor} pill={t.factorPill} />
        {web ? (
          <li>
            <StatusPill tone={web.tone}>{web.text}</StatusPill>
          </li>
        ) : null}
      </ul>

      {card.pageTitle || card.pageDescription ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">{t.homePageSays} </span>
          {[card.pageTitle, card.pageDescription].filter(Boolean).join(" · ")}
        </p>
      ) : null}
      {card.snippet ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">{t.inAnswer} </span>
          {card.snippet}
        </p>
      ) : null}
      {card.sourceUrls.length > 0 ? (
        <p className="text-xs text-muted-foreground">
          <span className="font-medium">{t.citedUrls} </span>
          <span className="font-mono break-all">{card.sourceUrls.join("  ")}</span>
        </p>
      ) : null}
      {card.factors.review.length > 0 && !decided ? (
        <ul className="list-disc pl-5 text-xs text-fair" lang="es">
          {card.factors.review.map((note) => (
            <li key={note}>{note}</li>
          ))}
        </ul>
      ) : null}

      {!decided ? (
        <div className="flex flex-col gap-3 border-t pt-3">
          <form key={acceptState.attempt} action={acceptAction} className="grid gap-3 sm:grid-cols-2">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`s-name-${card.id}`}>{t.name}</Label>
              <Input id={`s-name-${card.id}`} name="name" defaultValue={v.name ?? card.name} required maxLength={120} />
            </div>
            <div className="flex flex-col gap-1.5">
              <Label htmlFor={`s-web-${card.id}`}>{t.website}</Label>
              <Input id={`s-web-${card.id}`} name="website" defaultValue={v.website ?? card.domain ?? ""} inputMode="url" />
              <span className="text-xs text-muted-foreground">{t.websiteHint}</span>
            </div>
            <label className="flex items-start gap-2 sm:col-span-2">
              <input type="checkbox" name="reviewConfirmed" value="true" defaultChecked={v.reviewConfirmed === "true"} required className="mt-1" />
              <span>{t.confirm}</span>
            </label>
            <div className="flex flex-wrap items-center gap-3 sm:col-span-2">
              <Button type="submit" disabled={accepting || !canAdd} title={canAdd ? undefined : limitReason}>
                {accepting ? t.adding : t.add}
              </Button>
              {!canAdd ? <span className="text-xs text-muted-foreground">{limitReason}</span> : null}
              <Feedback state={acceptState} />
            </div>
          </form>
          <form action={dismissAction} className="flex flex-wrap items-center gap-3">
            <Button type="submit" variant="ghost" size="sm" disabled={dismissing}>
              {dismissing ? t.dismissing : t.dismiss}
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
  labels,
  locale,
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
  labels: SuggestionLabels;
  /** Interface language, for plural rules and number formats in `client-format`. */
  locale: Locale;
}) {
  const t = labels;
  const [state, formAction, pending] = useActionState(extract, initial);
  const v = state.ok ? {} : state.values;
  const canAdd = activeCount < maxActive;
  const limitReason = fillTemplate(t.limit, { max: maxActive });
  const pendingCards = cards.filter((c) => c.status === "suggested");
  const decidedCards = cards.filter((c) => c.status === "accepted" || c.status === "dismissed");

  return (
    <section aria-labelledby="suggestions-title" className="flex flex-col gap-4 border-t pt-4">
      <div>
        <h3 id="suggestions-title" className="text-sm font-medium">
          {t.title}
        </h3>
        <p className="text-xs text-muted-foreground">{t.description}</p>
      </div>

      <ol className="flex flex-col gap-2 text-sm">
        {questions.map((q) => (
          <li key={q} className="flex flex-wrap items-center gap-2">
            <CopyButton text={q} labels={t} />
            {/* Market question: stays in the business's language. */}
            <span lang="es">{q}</span>
          </li>
        ))}
      </ol>

      <form key={state.attempt} action={formAction} className="flex flex-col gap-3">
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="d-question">{t.question}</Label>
          <Input id="d-question" name="question" defaultValue={v.question ?? questions[0] ?? ""} required maxLength={500} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="d-answer">{t.answer}</Label>
          <Textarea id="d-answer" name="answer" rows={6} defaultValue={v.answer} required placeholder={t.answerPlaceholder} />
        </div>
        <div className="flex flex-col gap-1.5">
          <Label htmlFor="d-sources">{t.sources}</Label>
          <Textarea id="d-sources" name="sources" rows={3} defaultValue={v.sources} placeholder={t.sourcesPlaceholder} />
          <span className="text-xs text-muted-foreground">{t.sourcesHint}</span>
        </div>
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" disabled={pending}>
            {pending ? t.extracting : t.extract}
          </Button>
          <Feedback state={state} />
        </div>
      </form>

      {extraction ? (
        <div className="flex flex-col gap-3">
          <p className="text-xs text-muted-foreground">
            {fillTemplate(t.summary, {
              capturedAt: extraction.capturedAt,
              question: extraction.question,
              sources: plural(locale, t.sourcesCount, extraction.sourcesCount),
              candidates: plural(locale, t.candidatesCount, extraction.candidatesTotal),
            })}
          </p>
          <p className="text-xs text-muted-foreground">
            {fillTemplate(t.context, { context: extraction.context })} <span className="font-mono">{extraction.rulesVersion}</span>
          </p>
          {extraction.notice ? (
            <p role="note" className="rounded-md border border-border/80 bg-muted/60 p-2.5 text-xs text-muted-foreground">
              {extraction.notice}
            </p>
          ) : null}
          {extraction.warnings.length > 0 ? (
            <ul className="list-disc pl-5 text-xs text-muted-foreground" lang="es">
              {extraction.warnings.map((w) => (
                <li key={w}>{w}</li>
              ))}
            </ul>
          ) : null}
          {pendingCards.length === 0 && decidedCards.length === 0 ? (
            <p className="rounded-lg border p-3 text-sm text-muted-foreground">
              {extraction.warnings.length > 0 ? t.noCandidatesWithReasons : t.noCandidates}
            </p>
          ) : null}
          {pendingCards.length > 0 ? (
            <ul className="flex flex-col gap-3">
              {pendingCards.map((card) => (
                <Card key={card.id} card={card} workspaceId={workspaceId} accept={accept} dismiss={dismiss} canAdd={canAdd} limitReason={limitReason} labels={t} />
              ))}
            </ul>
          ) : null}
          {decidedCards.length > 0 ? (
            <details className="text-sm">
              <summary className="cursor-pointer text-muted-foreground">{fillTemplate(t.decided, { count: decidedCards.length })}</summary>
              <ul className="mt-2 flex flex-col gap-3">
                {decidedCards.map((card) => (
                  <Card key={card.id} card={card} workspaceId={workspaceId} accept={accept} dismiss={dismiss} canAdd={canAdd} limitReason={limitReason} labels={t} />
                ))}
              </ul>
            </details>
          ) : null}
        </div>
      ) : null}
    </section>
  );
}
