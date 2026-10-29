"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
import { createAnalyticsDeps } from "@/modules/analytics/deps";
import { refreshAnalytics } from "@/modules/analytics/service";
import { createBingWebmasterDeps } from "@/modules/bing-webmaster/deps";
import { refreshBingWebmaster } from "@/modules/bing-webmaster/service";
import { createSearchConsoleDeps } from "@/modules/search-console/deps";
import { refreshSearchConsole } from "@/modules/search-console/service";

/** Private operator only (no authentication until Phase 5, roadmap D-03). */

export interface RefreshSearchConsoleState {
  error: string | null;
}

export async function refreshSearchConsoleAction(workspaceId: string): Promise<RefreshSearchConsoleState> {
  const result = await refreshSearchConsole(getDb(), workspaceId, createSearchConsoleDeps());
  if (!result.ok) {
    const t = getMessages(await getLocale()).searchConsole.actionErrors;
    return { error: result.error === "not_configured" ? t.notConfigured : t.workspaceGone };
  }
  // A failed capture is stored too and explained by the page itself.
  revalidatePath(`/workspaces/${workspaceId}`);
  revalidatePath(`/workspaces/${workspaceId}/seo`);
  return { error: null };
}

export type RefreshBingWebmasterState = RefreshSearchConsoleState;

export async function refreshBingWebmasterAction(workspaceId: string): Promise<RefreshBingWebmasterState> {
  const result = await refreshBingWebmaster(getDb(), workspaceId, createBingWebmasterDeps());
  if (!result.ok) {
    const t = getMessages(await getLocale()).bingWebmaster.actionErrors;
    return { error: result.error === "not_configured" ? t.notConfigured : t.workspaceGone };
  }
  // A failed capture is stored too and explained by the page itself.
  revalidatePath(`/workspaces/${workspaceId}/seo`);
  return { error: null };
}

export type RefreshAnalyticsState = RefreshSearchConsoleState;

export async function refreshAnalyticsAction(workspaceId: string): Promise<RefreshAnalyticsState> {
  const result = await refreshAnalytics(getDb(), workspaceId, createAnalyticsDeps());
  if (!result.ok) {
    const t = getMessages(await getLocale()).analytics.actionErrors;
    return { error: result.error === "not_configured" ? t.notConfigured : t.workspaceGone };
  }
  // A failed capture is stored too and explained by the page itself.
  revalidatePath(`/workspaces/${workspaceId}/seo`);
  return { error: null };
}
