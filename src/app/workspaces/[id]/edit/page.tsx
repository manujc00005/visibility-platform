import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { SourcesPanel } from "@/components/workspaces/sources-panel";
import { WorkspaceForm } from "@/components/workspaces/workspace-form";
import { getDb } from "@/db/client";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { analyticsConfig } from "@/modules/analytics/deps";
import { latestAnalytics } from "@/modules/analytics/service";
import { summarizeAnalytics } from "@/modules/analytics/summary";
import { auditProviderConfig } from "@/modules/audits/deps";
import { listAudits } from "@/modules/audits/service";
import { bingWebmasterConfig } from "@/modules/bing-webmaster/deps";
import { latestBingWebmaster } from "@/modules/bing-webmaster/service";
import { summarizeBingWebmaster } from "@/modules/bing-webmaster/summary";
import { geoProviderStatus } from "@/modules/geo/deps";
import { listGeoRuns, listPrompts } from "@/modules/geo/service";
import { summarizeAi, summarizePerformance } from "@/modules/overview";
import { searchConsoleConfig } from "@/modules/search-console/deps";
import { latestSearchConsole } from "@/modules/search-console/service";
import { summarizeSearchConsole } from "@/modules/search-console/summary";
import { summarizeSources } from "@/modules/sources/summary";
import { formValuesOf } from "@/modules/workspaces/presentation";
import { getWorkspace } from "@/modules/workspaces/service";
import { countryOptions } from "@/modules/workspaces/validation";
import { updateWorkspaceAction } from "../../actions";

export async function generateMetadata(): Promise<Metadata> {
  return { title: getMessages(await getLocale()).workspaces.edit.title };
}

/**
 * Blocking route: the whole page depends on one record, and rendering it before the
 * response starts is what lets an unknown id return a real 404 instead of a streamed 200.
 */
export const instant = false;

export default async function EditWorkspacePage({ params }: PageProps<"/workspaces/[id]/edit">) {
  await connection();
  const { id } = await params;
  const locale = await getLocale();
  const db = getDb();
  const workspace = await getWorkspace(db, id);
  if (!workspace) notFound();
  const { workspaces } = getMessages(locale);

  // Stored data only (feature 015, D002): the panel maps what each source already summarizes.
  const [gscStored, bingStored, analyticsStored, audits, runs, prompts] = await Promise.all([
    latestSearchConsole(db, workspace.id),
    latestBingWebmaster(db, workspace.id),
    latestAnalytics(db, workspace.id),
    listAudits(db, workspace.id),
    listGeoRuns(db, workspace.id),
    listPrompts(db, workspace.id),
  ]);
  const now = new Date();
  const rows = summarizeSources(
    {
      workspaceId: workspace.id,
      searchConsole: { summary: summarizeSearchConsole(gscStored, searchConsoleConfig(), workspace.domain, locale) },
      bing: { summary: summarizeBingWebmaster(bingStored, bingWebmasterConfig(), workspace.domain, locale) },
      analytics: { summary: summarizeAnalytics(analyticsStored, analyticsConfig(), workspace.domain, locale) },
      // The top speed finding is not shown here, so the findings of the result audit are not loaded.
      pagespeed: { performance: summarizePerformance(audits, [], now, locale), config: auditProviderConfig() },
      ai: {
        summary: summarizeAi(
          runs.map(({ run, metrics }) => ({
            id: run.id,
            status: run.status,
            origin: run.origin,
            provider: run.provider,
            methodologyKey: run.methodologyKey,
            createdAt: run.createdAt,
            completedAt: run.completedAt,
            metrics,
          })),
          prompts.length,
          now,
          locale,
        ),
        providers: geoProviderStatus(locale),
      },
    },
    locale,
  );

  return (
    <div className="flex flex-col gap-8">
      <div className="flex flex-col gap-6">
        <div>
          <h1 className="text-2xl font-semibold tracking-tight">{workspaces.edit.title}</h1>
          <p className="text-sm text-muted-foreground">{workspace.name}</p>
        </div>
        {/* Remount on language change: the form state (values and messages) belongs to one language (SPEC, límite conocido). */}
        <WorkspaceForm
          key={locale}
          action={updateWorkspaceAction.bind(null, workspace.id)}
          initialValues={formValuesOf(workspace)}
          countries={countryOptions(locale)}
          labels={workspaces.form}
          submitLabel={workspaces.edit.submit}
          cancelHref={`/workspaces/${workspace.id}`}
        />
      </div>
      <SourcesPanel rows={rows} locale={locale} />
    </div>
  );
}
