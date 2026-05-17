import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth/config";

/**
 * Post-sign-in router. The login / magic-link / OAuth flows redirect here
 * after a successful auth. We read the session, pick the role's dashboard,
 * and forward. Not user-facing — they never see this page.
 *
 * Why a dedicated route: the marketing landing now owns `/`, so we can't
 * stuff role-redirect logic there anymore. A separate route keeps the
 * concerns clean.
 */
export default async function PostLoginPage() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");

  const role =
    (session.user as { systemRole?: "customer" | "employee" | "admin" }).systemRole ?? "customer";
  redirect(`/${role}/dashboard`);
}
