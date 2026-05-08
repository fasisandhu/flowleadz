import { redirect } from "next/navigation";
import { headers } from "next/headers";
import { auth } from "@/lib/better-auth/config";

export default async function Root() {
  const session = await auth.api.getSession({ headers: await headers() });
  if (!session?.user) redirect("/login");
  const role = (session.user as { systemRole: "customer" | "employee" | "admin" }).systemRole;
  redirect(`/${role}/dashboard`);
}
