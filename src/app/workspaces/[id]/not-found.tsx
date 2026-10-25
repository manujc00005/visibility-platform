import Link from "next/link";
import { buttonVariants } from "@/components/ui/button";

export default function WorkspaceNotFound() {
  return (
    <div className="flex flex-col items-start gap-3">
      <h1 className="text-2xl font-semibold tracking-tight">Empresa no encontrada</h1>
      <p className="text-sm text-muted-foreground">No existe ninguna empresa con esa dirección.</p>
      <Link href="/workspaces" className={buttonVariants({ variant: "outline" })}>
        Volver a empresas
      </Link>
    </div>
  );
}
