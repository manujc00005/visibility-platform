import { Suspense } from "react";
import { SystemStatus } from "@/components/system-status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";

const PHASES = [
  { id: "0", title: "Base del proyecto", state: "Hecha" },
  { id: "1", title: "Empresas y dominios", state: "Hecha" },
  { id: "2", title: "Auditoría SEO técnica", state: "Hecha" },
  { id: "3", title: "Informe PDF", state: "Hecha" },
  { id: "4", title: "Visibilidad GEO / AEO", state: "Siguiente" },
];

export default function HomePage() {
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">Visibility Platform</h1>
        <p className="max-w-2xl text-muted-foreground">
          Diagnóstico SEO y de visibilidad en buscadores con IA para pymes. Entorno privado de desarrollo.
        </p>
      </section>

      <Suspense
        fallback={
          <Card>
            <CardHeader>
              <CardTitle>Estado del sistema</CardTitle>
              <CardDescription>Comprobando…</CardDescription>
            </CardHeader>
          </Card>
        }
      >
        <SystemStatus />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle>Hoja de ruta</CardTitle>
          <CardDescription>Detalle en docs/visibility-mvp/16-implementation-roadmap.md</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-1 text-sm">
            {PHASES.map((phase) => (
              <li key={phase.id} className="flex justify-between gap-4">
                <span>
                  Fase {phase.id} · {phase.title}
                </span>
                <span className="text-muted-foreground">{phase.state}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
