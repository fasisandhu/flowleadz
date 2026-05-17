"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "../_action";
import * as users from "@/lib/services/users";

export async function adminListOrgMembersAction(orgId: string) {
  return withSessionContext((db, ctx) => users.listOrgMembers(db, ctx, { orgId }), { staffOrgId: orgId });
}

export async function adminListStaffUsersAction(orgId: string) {
  return withSessionContext((db, ctx) => users.listStaffUsers(db, ctx), { staffOrgId: orgId });
}

export async function adminInviteUserAction(orgId: string, input: users.InviteUserInput) {
  const r = await withSessionContext(
    (db, ctx) => users.inviteUser(db, ctx, input),
    { staffOrgId: orgId },
  );
  if (r.ok) {
    revalidatePath(`/admin/orgs/${orgId}`, "layout");
  }
  return r;
}
