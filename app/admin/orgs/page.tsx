import Link from "next/link";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { adminListOrgsAction } from "@/lib/server-actions/admin/orgs";

export default async function AdminOrgsPage() {
  const r = await adminListOrgsAction();
  const orgs = r.ok ? r.data : [];

  return (
    <div className="mx-auto max-w-4xl space-y-4 p-6">
      <h1 className="text-2xl font-semibold">Pick an organization</h1>
      {orgs.length === 0 ? (
        <p className="text-sm text-slate-500 dark:text-slate-400">No organizations yet.</p>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {orgs.map((o) => (
            <Card key={o.id}>
              <CardHeader>
                <CardTitle className="text-base">
                  <Link href={`/admin/orgs/${o.id}/dashboard`} className="hover:underline">
                    {o.name}
                  </Link>
                </CardTitle>
              </CardHeader>
              <CardContent className="text-xs text-slate-500 dark:text-slate-400">{o.slug}</CardContent>
            </Card>
          ))}
        </div>
      )}
    </div>
  );
}
