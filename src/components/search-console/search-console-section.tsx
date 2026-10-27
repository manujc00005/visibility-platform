import { Search } from "lucide-react";
import { StatusPill } from "@/components/audits/status-ui";
import { ChangeLine, NoticeList } from "@/components/overview/overview-card";
import type { Tone } from "@/modules/audits/status";
import type { SearchConsoleConfig } from "@/modules/search-console/deps";
import { displayDay, type SearchConsoleState, type SearchConsoleSummary } from "@/modules/search-console/summary";
import { displayDate } from "@/modules/workspaces/presentation";
import { RefreshSearchConsoleButton } from "./refresh-button";
import type { RefreshSearchConsoleState } from "@/app/workspaces/[id]/seo/actions";

const STATUS: Record<SearchConsoleState, { tone: Tone; label: string }> = {
  ok: { tone: "good", label: "Conectado" },
  no_data: { tone: "neutral", label: "Sin datos" },
  error: { tone: "bad", label: "Error" },
  not_configured: { tone: "neutral", label: "Sin configurar" },
  invalid_config: { tone: "bad", label: "Configuración no válida" },
};

const num = (n: number) => Math.round(n).toLocaleString("es-ES");
const pos = (n: number) => n.toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const pct = (r: number) => `${(r * 100).toLocaleString("es-ES", { minimumFractionDigits: 1, maximumFractionDigits: 1 })} %`;

function Setup({ config }: { config: SearchConsoleConfig }) {
  return (
    <ol className="flex max-w-3xl list-decimal flex-col gap-1 pl-5 text-sm text-muted-foreground">
      {config.state !== "ready" ? (
        <li>
          Crea una cuenta de servicio en Google Cloud, activa la API «Google Search Console API», descarga su clave JSON y guárdala en la variable
          de entorno <code className="font-mono text-foreground">GSC_SERVICE_ACCOUNT_JSON</code>.
        </li>
      ) : null}
      <li>
        En Search Console, abre la propiedad de la web, ve a Configuración › Usuarios y permisos y añade{" "}
        {config.state === "ready" ? <span className="font-mono text-foreground break-all">{config.clientEmail}</span> : "el email de esa cuenta"} con
        permiso completo o restringido.
      </li>
      <li>Vuelve aquí y pulsa «Traer datos de Search Console».</li>
    </ol>
  );
}

type Row = { key: string; label: string; clicks: number; impressions: number; ctr: number; position: number };

function Table({ caption, head, rows }: { caption: string; head: string; rows: Row[] }) {
  return (
    <div className="overflow-x-auto rounded-2xl border border-border/80 bg-card shadow-card">
      <table className="w-full text-sm">
        <caption className="px-4 pt-4 pb-2 text-left text-base font-semibold">{caption}</caption>
        <thead>
          <tr className="border-b text-left text-xs text-muted-foreground">
            <th scope="col" className="px-4 py-2 font-medium">
              {head}
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Clics
            </th>
            <th scope="col" className="px-3 py-2 text-right font-medium">
              Impresiones
            </th>
            <th scope="col" className="hidden px-3 py-2 text-right font-medium sm:table-cell">
              CTR
            </th>
            <th scope="col" className="px-4 py-2 text-right font-medium">
              Posición
            </th>
          </tr>
        </thead>
        <tbody className="divide-y">
          {rows.map((r) => (
            <tr key={r.key}>
              {/* Search terms and URLs are data from Google: plain text, never links (B08b). */}
              <td className="max-w-[16rem] px-4 py-2 break-words sm:max-w-md">{r.label}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num(r.clicks)}</td>
              <td className="px-3 py-2 text-right tabular-nums">{num(r.impressions)}</td>
              <td className="hidden px-3 py-2 text-right tabular-nums sm:table-cell">{pct(r.ctr)}</td>
              <td className="px-4 py-2 text-right tabular-nums">{pos(r.position)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

const METRICS = [
  ["clicks", "Clics", "Veces que alguien entró en tu web desde Google"],
  ["impressions", "Impresiones", "Veces que apareciste en los resultados"],
  ["ctr", "CTR", "Porcentaje de impresiones que acabaron en clic"],
  ["position", "Posición media", "Cuanto más baja, más arriba apareces"],
] as const;

export function SearchConsoleSection({
  s,
  config,
  action,
}: {
  s: SearchConsoleSummary;
  config: SearchConsoleConfig;
  action: (state: RefreshSearchConsoleState) => Promise<RefreshSearchConsoleState>;
}) {
  const status = STATUS[s.state];
  const canRun = config.state !== "not_configured";
  const notices = s.state === "ok" && s.lastFailure ? [{ kind: "failed" as const, text: `El último intento (${displayDate(s.lastFailure.at)}) falló: ${s.lastFailure.text}` }] : [];
  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-col gap-4 rounded-2xl border border-border/80 bg-card p-5 shadow-card">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-2">
            <span aria-hidden="true" className="flex size-8 shrink-0 items-center justify-center rounded-lg bg-brand-soft text-brand ring-1 ring-brand/15">
              <Search className="size-4" />
            </span>
            <span className="text-sm font-medium">Google Search Console</span>
            <StatusPill tone={status.tone}>{status.label}</StatusPill>
          </div>
          {canRun ? <RefreshSearchConsoleButton label={s.state === "ok" ? "Actualizar datos" : "Traer datos de Search Console"} action={action} /> : null}
        </div>

        {s.metrics && s.period ? (
          <>
            <dl className="grid grid-cols-2 gap-3 lg:grid-cols-4">
              {METRICS.map(([key, label, hint]) => (
                <div key={key} className="flex flex-col gap-1 rounded-lg bg-muted/50 p-3">
                  <dt className="text-xs font-medium text-muted-foreground">{label}</dt>
                  <dd className="text-2xl font-semibold tabular-nums">{s.metrics![key].value}</dd>
                  <dd>
                    <ChangeLine change={s.metrics![key].change} note={s.metrics![key].previous === null ? "Sin datos del periodo anterior" : null} className="text-xs" />
                  </dd>
                  <dd className="hidden text-xs text-muted-foreground sm:block">{hint}</dd>
                </div>
              ))}
            </dl>
            <NoticeList notices={notices} />
            <p className="text-xs text-muted-foreground">
              Google Search Console · propiedad <span className="font-mono break-all">{s.property}</span> · del {displayDay(s.period.start)} al{" "}
              {displayDay(s.period.end)}, comparado con los 28 días anteriores · consultado {s.capturedAt ? displayDate(s.capturedAt) : ""}
            </p>
          </>
        ) : (
          <>
            {s.reason ? <p className="max-w-3xl text-sm text-muted-foreground">{s.reason}</p> : null}
            {s.state === "not_configured" || s.state === "invalid_config" || s.state === "error" ? <Setup config={config} /> : null}
          </>
        )}
      </div>

      {s.metrics ? (
        <>
          {s.queries.length > 0 ? (
            <Table
              caption="Búsquedas por las que te encuentran"
              head="Búsqueda"
              rows={s.queries.map((q, i) => ({ key: `q${i}`, label: q.query, ...q }))}
            />
          ) : (
            <p className="text-sm text-muted-foreground">Sin búsquedas en este periodo.</p>
          )}
          {s.pages.length > 0 ? (
            <Table caption="Tus páginas más visibles" head="Página" rows={s.pages.map((p, i) => ({ key: `p${i}`, label: p.page, ...p }))} />
          ) : null}
          <p className="max-w-3xl text-xs text-muted-foreground">
            Las búsquedas que se hacen pocas veces no aparecen en la lista porque Google las oculta para proteger la privacidad, así que la suma de
            la tabla puede ser menor que el total. La posición es una media de todas las apariciones, no un puesto fijo.
          </p>
        </>
      ) : null}
    </div>
  );
}
