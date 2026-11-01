import { redirect } from "next/navigation";

/** The work starts at the company list (feature 015); the system status lives under /admin/status. */
export default function HomePage() {
  redirect("/workspaces");
}
