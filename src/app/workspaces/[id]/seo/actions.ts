"use server";

import { revalidatePath } from "next/cache";
import { getDb } from "@/db/client";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";
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
