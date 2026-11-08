/**
 * A plain disclosure (a `<details>` fold): no border, background or shadow of its own, because the
 * cards it holds already are the surface. Only the summary row says it opens: a chevron that turns,
 * a pointer, a hover tint and a visible focus ring. Shared by the Google and Performance pages.
 */
export const DISCLOSURE_SUMMARY_CLASSES =
  "-mx-2 flex cursor-pointer list-none items-start gap-2 rounded-md px-2 py-1.5 text-sm font-medium transition-colors hover:bg-muted/60 focus-visible:ring-2 focus-visible:ring-foreground/60 focus-visible:ring-offset-2 focus-visible:ring-offset-background focus-visible:outline-none [&::-webkit-details-marker]:hidden";
export const DISCLOSURE_CHEVRON_CLASSES = "mt-1 size-5 shrink-0 text-brand transition-transform group-open:rotate-90 motion-reduce:transition-none";
