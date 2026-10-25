/**
 * Escape-by-default HTML building (B08b). Every value interpolated into `html`…`` is
 * escaped unless it is a SafeHtml produced by `html` itself. Data from the audited website
 * can therefore only ever appear as text. SafeHtml is a class checked with instanceof, so a
 * plain object that looks like markup is escaped too.
 */

export class SafeHtml {
  readonly #value: string;
  constructor(value: string) {
    this.#value = value;
  }
  toString(): string {
    return this.#value;
  }
}

const ESCAPES: Record<string, string> = { "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" };

export function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => ESCAPES[char]!);
}

type Interpolation = SafeHtml | string | number | null | undefined | false | Interpolation[];

function render(value: Interpolation): string {
  if (value === null || value === undefined || value === false) return "";
  if (value instanceof SafeHtml) return value.toString();
  if (Array.isArray(value)) return value.map(render).join("");
  return escapeHtml(String(value));
}

export function html(strings: TemplateStringsArray, ...values: Interpolation[]): SafeHtml {
  let out = strings[0]!;
  values.forEach((value, index) => {
    out += render(value) + strings[index + 1]!;
  });
  return new SafeHtml(out);
}

export function join(items: Interpolation[], separator: string): SafeHtml {
  return new SafeHtml(items.map(render).join(escapeHtml(separator)));
}
