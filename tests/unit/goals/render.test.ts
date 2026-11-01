import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { GoalForm } from "@/components/workspaces/goal-form";
import { GoalLine } from "@/components/workspaces/goal-line";
import { getMessages } from "@/i18n/messages";
import type { GoalView } from "@/modules/goals/summary";

/** What the goal line and form paint (feature 016, AC-005), rendered without a database. */

const AT = new Date("2026-10-31T21:31:00Z");
const view = (over: Partial<GoalView>): GoalView => ({
  state: "none",
  status: { tone: "neutral", label: "Sin definir" },
  kind: null,
  kindLabel: null,
  label: null,
  event: null,
  count: null,
  period: null,
  observedAt: null,
  text: "Objetivo comercial sin definir.",
  notes: [],
  ...over,
});
const goal = { workspaceId: "w1", kind: "request" as const, label: "Solicitud de presupuesto", eventName: "generate_lead", createdAt: AT, updatedAt: AT };
const noop = async <T,>(state: T) => state;

describe("GoalLine", () => {
  it("paints the three states with a pill, the notes and a link to the edit page", () => {
    const none = renderToStaticMarkup(createElement(GoalLine, { view: view({}), workspaceId: "w1", locale: "es" }));
    expect(none).toContain(">Sin definir</span>");
    expect(none).toContain("Objetivo comercial sin definir.");
    expect(none).toContain('href="/workspaces/w1/edit#goal-title"');
    expect(none).toContain("Definirlo");
    const pending = renderToStaticMarkup(
      createElement(GoalLine, { view: view({ state: "pending", status: { tone: "neutral", label: "Pendiente" }, text: "X: pendiente.", notes: ["Conecta Google Analytics para comprobarlo."] }), workspaceId: "w1", locale: "es" }),
    );
    expect(pending).toContain(">Pendiente</span>");
    expect(pending).toContain("Conecta Google Analytics para comprobarlo.");
    expect(pending).toContain("Editar");
    const verified = renderToStaticMarkup(createElement(GoalLine, { view: view({ state: "verified", status: { tone: "good", label: "Measured" }, text: "X: 2 from search engines." }), workspaceId: "w1", locale: "en" }));
    expect(verified).toContain(">Measured</span>");
    expect(verified).toContain("Edit");
    // Texts are data: a hostile label stays text.
    const hostile = renderToStaticMarkup(createElement(GoalLine, { view: view({ text: "<script>alert(1)</script>" }), workspaceId: "w1", locale: "es" }));
    expect(hostile).not.toContain("<script>");
  });
});

describe("GoalForm", () => {
  const t = getMessages("es").goals;
  it("offers the configured events as options and the stored one first, with a removal form only when a goal exists", () => {
    const html = renderToStaticMarkup(createElement(GoalForm, { goal, currentText: t.current("Solicitud", "Solicitud de presupuesto", "generate_lead"), configuredEvents: ["purchase", "generate_lead"], save: noop, remove: noop, labels: t.form, kinds: t.kinds }));
    expect(html).toContain(t.current("Solicitud", "Solicitud de presupuesto", "generate_lead"));
    expect(html).toContain('<option value="generate_lead" selected="">generate_lead</option>');
    expect(html).toContain('<option value="purchase">purchase</option>');
    expect(html).toContain(t.form.eventHint);
    expect(html).toContain(t.form.remove);
    expect(html.split("<form").length - 1).toBe(2);
    expect(html).toContain('<option value="request" selected="">Solicitud</option>');
  });

  it("types the event when GA4 returned none, keeps an event GA4 no longer lists, and has no removal without a goal", () => {
    const empty = renderToStaticMarkup(createElement(GoalForm, { goal: null, currentText: null, configuredEvents: [], save: noop, remove: noop, labels: t.form, kinds: t.kinds }));
    expect(empty).toContain('name="eventName"');
    expect(empty).toContain(t.form.eventFreeHint);
    expect(empty).not.toContain("<option value=\"generate_lead\"");
    expect(empty).not.toContain(t.form.remove);
    expect(empty.split("<form").length - 1).toBe(1);
    const stale = renderToStaticMarkup(createElement(GoalForm, { goal, currentText: null, configuredEvents: ["purchase"], save: noop, remove: noop, labels: t.form, kinds: t.kinds }));
    expect(stale).toContain('<option value="generate_lead" selected="">generate_lead</option>');
    // The event options, not the kind options (which also contain "purchase").
    expect(stale.indexOf('value="generate_lead">generate_lead<')).toBeLessThan(stale.indexOf('value="purchase">purchase<'));
  });
});
