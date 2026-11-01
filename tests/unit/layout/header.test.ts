import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it, vi } from "vitest";
import type { Locale } from "@/i18n/locale";

const nav = vi.hoisted(() => ({ pathname: "/" }));
vi.mock("next/navigation", () => ({ usePathname: () => nav.pathname }));
// The real action needs the request scope; the markup only needs a form target.
vi.mock("@/i18n/actions", () => ({ setLocaleAction: "/locale" }));

import { AppHeader, MAIN_CONTENT_ID } from "@/components/layout/app-header";
import { isActivePath } from "@/components/layout/header-nav";
import { WorkspaceNav } from "@/components/overview/workspace-nav";
import { getMessages } from "@/i18n/messages";

function render(locale: Locale, pathname: string): string {
  nav.pathname = pathname;
  return renderToStaticMarkup(createElement(AppHeader, { locale, messages: getMessages(locale) }));
}

/** Opening tags of `name` elements, in document order. */
function tags(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "g")) ?? [];
}

describe("isActivePath (/workspaces for everything below it; the root is no item since feature 015)", () => {
  it.each([
    ["/", "/workspaces", false],
    ["/workspaces", "/workspaces", true],
    ["/workspaces/new", "/workspaces", true],
    ["/workspaces/4f2c/geo", "/workspaces", true],
    ["/admin/status", "/workspaces", false],
  ])("pathname %s, href %s → %s", (pathname, href, expected) => {
    expect(isActivePath(pathname, href)).toBe(expected);
  });
});

describe("AppHeader markup", () => {
  it("puts the skip link first, pointing at the main content, in the active language", () => {
    const en = render("en", "/");
    const [first] = tags(en, "a");
    expect(first).toContain(`href="#${MAIN_CONTENT_ID}"`);
    expect(en).toContain(">Skip to content</a>");
    expect(render("es", "/")).toContain(">Saltar al contenido</a>");
  });

  it("labels the navigation and marks the current page; the root item is gone (feature 015)", () => {
    const list = render("es", "/workspaces");
    expect(list).toContain('<nav aria-label="Principal"');
    const atList = tags(list, "a").filter((t) => t.includes('aria-current="page"'));
    expect(atList).toHaveLength(1);
    expect(atList[0]).toContain('href="/workspaces"');
    expect(list).toContain(">Empresas</a>");
    expect(list).not.toContain(">Inicio</a>");
    // The brand goes to the company list too: the root only redirects there.
    expect(tags(list, "a").filter((t) => t.includes('href="/workspaces"')).length).toBe(2);
    expect(tags(list, "a").some((t) => t.includes('href="/"'))).toBe(false);
    expect(tags(render("es", "/admin/status"), "a").filter((t) => t.includes('aria-current="page"'))).toHaveLength(0);

    const geo = render("en", "/workspaces/4f2c/geo");
    expect(geo).toContain('<nav aria-label="Main"');
    const current = tags(geo, "a").filter((t) => t.includes('aria-current="page"'));
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/workspaces"');
    expect(geo).not.toContain(">Home</a>");
    expect(geo).toContain(">Companies</a>");
  });

  it("keeps the brand name for screen readers", () => {
    expect(render("es", "/")).toContain('<span class="sr-only sm:not-sr-only">Visibility Platform</span>');
  });

  it("renders the language switcher as a form with named, enabled buttons in their own language", () => {
    const en = render("en", "/");
    const [form] = tags(en, "form");
    expect(form).toContain('action="/locale"');
    expect(en).toContain('role="group" aria-label="Language"');
    const buttons = tags(en, "button");
    expect(buttons).toHaveLength(2);
    const [es, enBtn] = buttons;
    for (const b of buttons) {
      expect(b).toContain('type="submit"');
      expect(b).toContain('name="locale"');
      expect(b).not.toContain("disabled");
    }
    expect(es).toContain('value="es"');
    expect(es).toContain('lang="es"');
    expect(es).toContain('aria-label="Español"');
    expect(es).not.toContain("aria-current");
    expect(enBtn).toContain('value="en"');
    expect(enBtn).toContain('lang="en"');
    expect(enBtn).toContain('aria-label="English"');
    expect(enBtn).toContain('aria-current="true"');
    expect(en).toContain(">ES</button>");
    expect(en).toContain(">EN</button>");

    const es2 = render("es", "/");
    expect(es2).toContain('role="group" aria-label="Idioma"');
    const [esActive, enInactive] = tags(es2, "button");
    expect(esActive).toContain('aria-current="true"');
    expect(enInactive).not.toContain("aria-current");
  });
});

describe("WorkspaceNav (feature 017)", () => {
  it("offers Configuración at the end and marks it as the current section on the edit page", () => {
    const es = renderToStaticMarkup(createElement(WorkspaceNav, { workspaceId: "w1", current: "settings", locale: "es" }));
    expect(es).toContain('href="/workspaces/w1/edit"');
    expect(tags(es, "a").filter((t) => t.includes('aria-current="page"'))).toHaveLength(1);
    expect(tags(es, "a").find((t) => t.includes('aria-current="page"'))).toContain('href="/workspaces/w1/edit"');
    expect(es.indexOf('href="/workspaces/w1/geo"')).toBeLessThan(es.indexOf('href="/workspaces/w1/edit"'));
    expect(es).toContain(">Configuración<");
    expect(renderToStaticMarkup(createElement(WorkspaceNav, { workspaceId: "w1", current: "overview", locale: "en" }))).toContain(">Settings<");
  });
});
