import { ChevronRight } from "lucide-react";
import Link from "next/link";
import type { ReactNode } from "react";
import { StatusPill, ToneIcon } from "@/components/audits/status-ui";
import type { Tone } from "@/modules/audits/status";
import { PRIORITY_LABELS, type OpportunityList, type Priority } from "@/modules/overview";
import { displayDate } from "@/modules/workspaces/presentation";

const PRIORITY_TONE: Record<Priority, Tone> = { high: "bad", medium: "fair", low: "info" };

function Empty({ title, children, action }: { title: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="flex flex-col items-start gap-3 rounded-2xl border border-dashed bg-card/60 p-6">
      <p className="font-medium">{title}</p>
      <p className="max-w-2xl text-sm text-muted-foreground">{children}</p>
      {action}
    </div>
  );
}

/**
 * "Tus próximas oportunidades". Never fills the list: zero items is a valid answer, with
 * one of three messages depending on how much was measured (AC-006).
 */
export function Opportunities({ workspaceId, list, emptyAction }: { workspaceId: string; list: OpportunityList; emptyAction?: ReactNode }) {
  return (
    <section aria-labelledby="opportunities-title" className="flex flex-col gap-4">
      <div className="flex flex-col gap-1">
        <h2 id="opportunities-title" className="text-lg font-semibold tracking-tight">
          Tus próximas oportunidades
        </h2>
        <p className="text-sm text-muted-foreground">Lo primero que conviene mejorar, según lo que hemos medido.</p>
      </div>

      {list.evidence === "none" ? (
        <Empty title="Todavía no podemos recomendar mejoras" action={emptyAction}>
          Necesitamos al menos una auditoría o una medición en IA para basar las recomendaciones en datos reales.
        </Empty>
      ) : (
        <>
          {list.evidence === "partial" ? (
            <div className="flex items-start gap-2.5 rounded-xl border border-brand/15 bg-brand-soft/60 px-4 py-3 text-sm">
              <ToneIcon tone="neutral" className="mt-0.5 size-4" />
              <div className="flex flex-col gap-0.5">
                <p className="font-medium">Las recomendaciones se basan en los datos disponibles.</p>
                <ul className="text-muted-foreground">
                  {list.pending.map((p) => (
                    <li key={p}>{p}</li>
                  ))}
                </ul>
              </div>
            </div>
          ) : null}

          {list.items.length === 0 ? (
            list.evidence === "complete" ? (
              <Empty title="No hemos detectado problemas prioritarios en las mediciones disponibles">
                Repite el análisis tras cualquier cambio importante en la web.
              </Empty>
            ) : (
              <p className="text-sm text-muted-foreground">Con los datos disponibles no hemos encontrado acciones prioritarias.</p>
            )
          ) : (
            <ol className="flex flex-col gap-3">
              {list.items.map((o, i) => (
                <li key={o.kind}>
                  <article aria-labelledby={`opportunity-${o.kind}`} className="flex flex-col gap-3 rounded-2xl border border-border/80 bg-card p-6 shadow-card">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="flex size-6 items-center justify-center rounded-full bg-brand-soft text-xs font-semibold text-brand tabular-nums">{i + 1}</span>
                      <StatusPill tone={PRIORITY_TONE[o.priority]}>{PRIORITY_LABELS[o.priority]}</StatusPill>
                    </div>
                    <h3 id={`opportunity-${o.kind}`} className="text-base font-semibold tracking-tight">
                      {o.title}
                    </h3>
                    <dl className="grid grid-cols-1 gap-3 text-sm md:grid-cols-3">
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-medium text-muted-foreground">Qué ocurre</dt>
                        <dd className="break-words">{o.problem}</dd>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-medium text-muted-foreground">Por qué importa</dt>
                        <dd>{o.why}</dd>
                      </div>
                      <div className="flex flex-col gap-0.5">
                        <dt className="text-xs font-medium text-muted-foreground">Qué recomendamos</dt>
                        <dd>{o.action}</dd>
                      </div>
                    </dl>
                    <div className="rounded-lg bg-muted/60 p-3">
                      <p className="text-xs font-medium text-muted-foreground">Evidencia</p>
                      <ul className="mt-1 flex flex-col gap-0.5 text-xs">
                        {o.evidence.map((line) => (
                          <li key={line} className="break-words">
                            {line}
                          </li>
                        ))}
                      </ul>
                    </div>
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-muted-foreground">
                      <span>
                        {o.sourceLabel} · {displayDate(o.measuredAt)}
                      </span>
                      <Link
                        href={`/workspaces/${workspaceId}${o.href}`}
                        className="inline-flex items-center gap-0.5 rounded-sm font-medium text-brand hover:underline focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:outline-none"
                      >
                        Ver el detalle
                        <ChevronRight aria-hidden="true" className="size-4" />
                      </Link>
                    </div>
                  </article>
                </li>
              ))}
            </ol>
          )}
        </>
      )}
    </section>
  );
}
