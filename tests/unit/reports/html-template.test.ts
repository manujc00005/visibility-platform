import { describe, expect, it } from "vitest";
import { escapeHtml, html, join, SafeHtml } from "@/modules/reports/html-template";

describe("escapeHtml", () => {
  it("escapes the five HTML-significant characters", () => {
    expect(escapeHtml(`<a href="x" title='y'>&</a>`)).toBe("&lt;a href=&quot;x&quot; title=&#39;y&#39;&gt;&amp;&lt;/a&gt;");
  });
});

describe("html tagged template", () => {
  it("escapes interpolated strings and numbers", () => {
    const value = `<script>alert("x")</script>`;
    expect(html`<p>${value} ${42}</p>`.toString()).toBe("<p>&lt;script&gt;alert(&quot;x&quot;)&lt;/script&gt; 42</p>");
  });

  it("escapes values used inside attributes so they cannot break out", () => {
    const hostile = `" onmouseover="alert(1)`;
    expect(html`<span title="${hostile}"></span>`.toString()).toBe(
      '<span title="&quot; onmouseover=&quot;alert(1)"></span>',
    );
  });

  it("does not re-escape fragments built by the template itself", () => {
    const inner = html`<b>${"<i>"}</b>`;
    expect(html`<p>${inner}</p>`.toString()).toBe("<p><b>&lt;i&gt;</b></p>");
  });

  it("only trusts real SafeHtml instances, not look-alike objects", () => {
    const fake = { __html: "<script>alert(1)</script>", toString: () => "<script>alert(1)</script>" };
    // The type already forbids this at compile time; the runtime check covers untyped data.
    expect(html`<p>${fake as unknown as string}</p>`.toString()).toBe("<p>&lt;script&gt;alert(1)&lt;/script&gt;</p>");
  });

  it("renders null, undefined and false as nothing, arrays item by item", () => {
    expect(html`<p>${null}${undefined}${false}</p>`.toString()).toBe("<p></p>");
    expect(html`<ul>${["<a>", html`<li>ok</li>`]}</ul>`.toString()).toBe("<ul>&lt;a&gt;<li>ok</li></ul>");
  });

  it("joins fragments with an escaped separator", () => {
    expect(join([html`<i>a</i>`, "b&c"], " · ").toString()).toBe("<i>a</i> · b&amp;c");
  });

  it("exposes SafeHtml as a class so the type cannot be forged with a cast", () => {
    expect(html`x`).toBeInstanceOf(SafeHtml);
  });
});
