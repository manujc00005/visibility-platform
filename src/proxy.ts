import { NextResponse, type NextRequest } from "next/server";
import { getDb } from "@/db/client";
import { logger } from "@/lib/logger";
import { workspaceRouteExists } from "@/modules/routing/exists";
import { parseWorkspaceRoute } from "@/modules/routing/workspace-route";

/**
 * Real 404 for unknown workspace, audit and run ids.
 *
 * With `cacheComponents`, the build prerenders these routes with a postponed state whose
 * recorded status is 200 (`x-nextjs-prerender: 1`, `x-nextjs-postponed: 1`). At request time
 * the status is already fixed when the page reaches `notFound()`, so the not-found UI arrives
 * with 200. `export const instant = false` only disables instant-navigation validation; it
 * does not change this. Next.js documents a request-time check in Proxy as the way to return
 * a 404 before the response starts.
 *
 * Only document requests are checked (GET/HEAD without RSC, prefetch or action headers):
 * client navigations already show the not-found UI and their status is not user-visible.
 * Unknown ids are rewritten to the static not-found route (global `src/app/not-found.tsx`),
 * which answers 404; the browser keeps the requested URL.
 * If the lookup fails, the request continues as before rather than failing the page.
 */
export const config = { matcher: "/workspaces/:path+" };

export async function proxy(request: NextRequest) {
  if (request.method !== "GET" && request.method !== "HEAD") return NextResponse.next();
  if (request.headers.has("rsc") || request.headers.has("next-router-prefetch") || request.headers.has("next-action")) {
    return NextResponse.next();
  }
  const route = parseWorkspaceRoute(request.nextUrl.pathname);
  if (route.kind === "skip") return NextResponse.next();
  try {
    if (route.kind === "check" && (await workspaceRouteExists(getDb(), route))) return NextResponse.next();
  } catch (error) {
    logger.error({ err: error, path: request.nextUrl.pathname }, "workspace route lookup failed in proxy");
    return NextResponse.next();
  }
  // A rewrite keeps the status of its target. Rewriting to the same URL would serve the
  // postponed 200 again; `/_not-found` is the static not-found route and answers 404.
  return NextResponse.rewrite(new URL("/_not-found", request.url));
}
