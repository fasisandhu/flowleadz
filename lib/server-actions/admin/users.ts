"use server";

import { withSessionContext } from "../_action";
import * as users from "@/lib/services/users";

export async function adminListOrgMembersAction(orgId: string) {
  return withSessionContext((db, ctx) => users.listOrgMembers(db, ctx, { orgId }), { staffOrgId: orgId });
}
