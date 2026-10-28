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
import { getMessages } from "@/i18n/messages";

function render(locale: Locale, pathname: string): string {
  nav.pathname = pathname;
  return renderToStaticMarkup(createElement(AppHeader, { locale, messages: getMessages(locale) }));
}

/** Opening tags of `name` elements, in document order. */
function tags(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "g")) ?? [];
}

describe("isActivePath (SPEC §5: root only at the root, /workspaces for everything below it)", () => {
  it.each([
    ["/", "/", true],
    ["/", "/workspaces", false],
    ["/workspaces", "/", false],
    ["/workspaces", "/workspaces", true],
    ["/workspaces/new", "/workspaces", true],
    ["/workspaces/4f2c/geo", "/workspaces", true],
    ["/workspaces/4f2c/geo", "/", false],
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

  it("labels the navigation and marks the current page", () => {
    const home = render("es", "/");
    expect(home).toContain('<nav aria-label="Principal"');
    const atHome = tags(home, "a").filter((t) => t.includes('aria-current="page"'));
    expect(atHome).toHaveLength(1);
    expect(atHome[0]).toContain('href="/"');
    expect(home).toContain(">Inicio</a>");
    expect(home).toContain(">Empresas</a>");

    const geo = render("en", "/workspaces/4f2c/geo");
    expect(geo).toContain('<nav aria-label="Main"');
    const current = tags(geo, "a").filter((t) => t.includes('aria-current="page"'));
    expect(current).toHaveLength(1);
    expect(current[0]).toContain('href="/workspaces"');
    expect(geo).toContain(">Home</a>");
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
