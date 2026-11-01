import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { BusinessProfileForm } from "@/components/geo/business-profile-form";
import {
  CompetitorSuggestions,
  type SuggestionCard,
} from "@/components/geo/competitor-suggestions";
import { CompetitorForm } from "@/components/geo/geo-forms";
import { getDb } from "@/db/client";
import { DEFAULT_LOCALE, type Locale } from "@/i18n/locale";
import { getMessages, type Messages } from "@/i18n/messages";
import {
  acceptSuggestionAction,
  addCompetitorAction,
  archiveCompetitorAction,
  dismissSuggestionAction,
  extractCompetitorsAction,
  proposeBusinessProfileAction,
  saveBusinessProfileAction,
} from "@/app/workspaces/[id]/geo/actions";
import { profileContext } from "@/modules/geo/competitors/profile";
import { getBusinessProfile } from "@/modules/geo/competitors/profile-service";
import type { ExtractionContext } from "@/modules/geo/competitors/schema";
import { listSuggestions } from "@/modules/geo/competitors/service";
import {
  discoveryPrompt,
  discoveryQuestions,
} from "@/modules/geo/prompt-suggestions";
import { listCompetitors, MAX_ACTIVE_COMPETITORS } from "@/modules/geo/service";
import type { Workspace } from "@/modules/workspaces/schema";
import {
  displayCountry,
  displayDate,
  displayDomain,
} from "@/modules/workspaces/presentation";

/** Company record frozen at extraction time. Its values (sector, place, services) are the user's own data. */
function contextLine(
  c: ExtractionContext,
  t: Messages["geo"]["setup"]["context"],
  profile: Messages["geo"]["profile"]["form"],
): string {
  const parts = [
    c.brandName,
    c.sector,
    c.city ? `${c.city} (${c.countryName})` : c.countryName,
  ];
  if (c.aliases.length) parts.push(t.aliases(c.aliases.join(", ")));
  if (c.services.length) parts.push(t.services(c.services.join(", ")));
  if (c.profile)
    parts.push(
      profile.customerTypes[c.profile.customerType],
      profile.zones[c.profile.zoneRelevance],
    );
  return parts.join(" · ");
}

/**
 * Competitors of a company: the list, manual entry, business profile and assisted detection.
 * Lives in Configuración because the comparison and the AI measurement both read it (feature 017).
 */
export async function CompetitorsPanel({
  workspace,
  locale,
}: {
  workspace: Workspace;
  locale: Locale;
}) {
  const db = getDb();
  const m = getMessages(locale);
  const t = m.geo.setup;
  const [competitors, discovery, profile] = await Promise.all([
    listCompetitors(db, workspace.id),
    listSuggestions(db, workspace.id),
    getBusinessProfile(db, workspace.id),
  ]);
  // Market questions are built in the business's language: the country name stays Spanish (SPEC «Límites»).
  const countryName = displayCountry(workspace.country);
  const questions = profile
    ? [
        discoveryPrompt({
          brandName: workspace.name,
          hostname: workspace.domain,
          sector: workspace.sector,
          countryName,
          services: workspace.services,
          profile: profileContext(profile),
        }),
      ]
    : discoveryQuestions({
        brandName: workspace.name,
        sector: workspace.sector,
        city: workspace.city,
        countryName,
      });
  const cards: SuggestionCard[] = (discovery?.suggestions ?? [])
    .filter((s) => s.status !== "superseded")
    .map((s) => ({
      id: s.id,
      status: s.status,
      name: s.name,
      kind: s.competitorKind,
      domain: s.domain,
      sourceUrls: s.sourceUrls,
      snippet: s.snippet,
      pageTitle: s.pageTitle,
      pageDescription: s.pageDescription,
      factors: s.factors,
      webStatus: s.webStatus,
      finalUrl: s.finalUrl,
      acceptedName: s.acceptedInput?.name ?? null,
    }));

  return (
    <section
      id="competitors"
      aria-labelledby="competitors-heading"
      className="flex scroll-mt-20 flex-col gap-3"
    >
      <div className="flex flex-col gap-1">
        <h2
          id="competitors-heading"
          className="text-lg font-semibold tracking-tight"
        >
          {t.competitors.title}
        </h2>
        <p className="max-w-3xl text-sm text-muted-foreground">
          {t.competitors.description(MAX_ACTIVE_COMPETITORS)}
        </p>
      </div>
      <Card>
        <CardContent className="flex flex-col gap-4">
          {competitors.length > 0 ? (
            <ul className="flex flex-col divide-y text-sm">
              {competitors.map((c) => (
                <li
                  key={c.id}
                  className="flex flex-wrap items-center justify-between gap-2 py-2"
                >
                  <span>
                    <strong>{c.name}</strong>
                    {c.domain ? (
                      <span className="font-mono text-xs text-muted-foreground">
                        {" "}
                        · {displayDomain(c.domain)}
                      </span>
                    ) : null}
                    {c.aliases.length ? (
                      <span className="text-muted-foreground">
                        {" "}
                        · {c.aliases.join(", ")}
                      </span>
                    ) : null}
                  </span>
                  <form
                    action={archiveCompetitorAction.bind(
                      null,
                      workspace.id,
                      c.id,
                    )}
                  >
                    <Button type="submit" variant="ghost" size="sm">
                      {t.competitors.remove}
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-muted-foreground">
              {t.competitors.none}
            </p>
          )}
          {competitors.length < MAX_ACTIVE_COMPETITORS ? (
            <CompetitorForm
              action={addCompetitorAction.bind(null, workspace.id)}
              labels={m.geo.forms}
            />
          ) : null}
          <BusinessProfileForm
            profile={profile}
            propose={proposeBusinessProfileAction.bind(null, workspace.id)}
            save={saveBusinessProfileAction.bind(null, workspace.id)}
            labels={m.geo.profile.form}
          />
          <CompetitorSuggestions
            workspaceId={workspace.id}
            questions={questions}
            questionsNote={profile ? null : m.geo.profile.form.needsProfile}
            extraction={
              discovery
                ? {
                    question: discovery.extraction.question,
                    capturedAt: displayDate(
                      discovery.extraction.createdAt,
                      locale,
                    ),
                    sourcesCount: discovery.extraction.sources.length,
                    candidatesTotal: discovery.extraction.candidatesTotal,
                    warnings: discovery.extraction.warnings,
                    context: contextLine(
                      discovery.extraction.contextSnapshot,
                      t.context,
                      m.geo.profile.form,
                    ),
                    rulesVersion: discovery.extraction.rulesVersion,
                    notice:
                      locale !== DEFAULT_LOCALE
                        ? m.geo.suggestions.originalNotice
                        : null,
                  }
                : null
            }
            cards={cards}
            activeCount={competitors.length}
            maxActive={MAX_ACTIVE_COMPETITORS}
            extract={extractCompetitorsAction.bind(null, workspace.id)}
            accept={acceptSuggestionAction}
            dismiss={dismissSuggestionAction}
            labels={m.geo.suggestions}
            locale={locale}
          />
        </CardContent>
      </Card>
    </section>
  );
}
