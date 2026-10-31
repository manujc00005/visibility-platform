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
import { addTrackedKeyword, removeTrackedKeyword } from "@/modules/search-console/tracked-keywords-service";

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

export interface KeywordActionState {
  error: string | null;
  value: string;
  revision: number;
}

const revisionOf = (state: KeywordActionState) => (Number.isInteger(state?.revision) ? state.revision : 0);

export async function addTrackedKeywordAction(workspaceId: string, state: KeywordActionState, form: FormData): Promise<KeywordActionState> {
  const t = getMessages(await getLocale()).searchConsole.tracked;
  const revision = revisionOf(state);
  const raw = form instanceof FormData ? form.get("keyword") : null;
  const value = typeof raw === "string" ? raw.slice(0, 1000) : "";
  try {
    const result = await addTrackedKeyword(getDb(), workspaceId, raw);
    if (!result.ok) return { error: t[result.error], value, revision };
    revalidatePath(`/workspaces/${workspaceId}/seo`);
    return { error: null, value: "", revision: revision + 1 };
  } catch {
    return { error: t.failure, value, revision };
  }
}

export async function removeTrackedKeywordAction(workspaceId: string, keywordId: string, state: KeywordActionState): Promise<KeywordActionState> {
  const t = getMessages(await getLocale()).searchConsole.tracked;
  try {
    const result = await removeTrackedKeyword(getDb(), workspaceId, keywordId);
    if (!result.ok) return { ...state, error: t[result.error] };
    revalidatePath(`/workspaces/${workspaceId}/seo`);
    return { error: null, value: "", revision: revisionOf(state) + 1 };
  } catch {
    return { ...state, error: t.failure };
  }
}
