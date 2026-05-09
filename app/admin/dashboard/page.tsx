import { redirect } from "next/navigation";
import { adminListOrgsAction } from "@/lib/server-actions/admin/orgs";

export default async function AdminDashboardRedirectPage() {
  const r = await adminListOrgsAction();
  if (r.ok && r.data.length > 0) {
    redirect(`/admin/orgs/${r.data[0]!.id}/dashboard`);
  }
  redirect("/admin/orgs");
}
