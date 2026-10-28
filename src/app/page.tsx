import { Suspense } from "react";
import { SystemStatus } from "@/components/system-status";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { getMessages } from "@/i18n/messages";
import { getLocale } from "@/i18n/server";

export default async function HomePage() {
  const locale = await getLocale();
  const { common, home } = getMessages(locale);
  return (
    <div className="flex flex-col gap-8">
      <section className="flex flex-col gap-2">
        <h1 className="text-2xl font-semibold tracking-tight">{common.brand}</h1>
        <p className="max-w-2xl text-muted-foreground">{home.description}</p>
      </section>

      <Suspense
        fallback={
          <Card>
            <CardHeader>
              <CardTitle>{home.systemStatus.title}</CardTitle>
              <CardDescription>{home.systemStatus.checking}</CardDescription>
            </CardHeader>
          </Card>
        }
      >
        <SystemStatus locale={locale} />
      </Suspense>

      <Card>
        <CardHeader>
          <CardTitle>{home.roadmap.title}</CardTitle>
          <CardDescription>{home.roadmap.description}</CardDescription>
        </CardHeader>
        <CardContent>
          <ol className="flex flex-col gap-1 text-sm">
            {home.roadmap.phases.map((phase) => (
              <li key={phase.label} className="flex justify-between gap-4">
                <span>{phase.label}</span>
                <span className="text-muted-foreground">{phase.state}</span>
              </li>
            ))}
          </ol>
        </CardContent>
      </Card>
    </div>
  );
}
