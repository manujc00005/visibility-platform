import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

/**
 * Global not-found page. Served with a real 404 for unknown URLs and, through `src/proxy.ts`,
 * for unknown workspace, audit or measurement ids on direct visits.
 */
export default function NotFound() {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">Página no encontrada</h1>
      <p className="text-sm text-muted-foreground">
        No existe ninguna página con esta dirección. Puede que la empresa, la auditoría o la medición ya no exista.
      </p>
      <Link href="/workspaces" className={buttonVariants({ variant: "outline" })}>
        Volver a empresas
      </Link>
    </div>
  );
}
