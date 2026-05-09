"use server";

import { withSessionContext } from "../_action";
import * as users from "@/lib/services/users";

export async function adminListOrgMembersAction(orgId: string, input: users.ListOrgMembersInput = { orgId }) {
  return withSessionContext((db, ctx) => users.listOrgMembers(db, ctx, input), { staffOrgId: orgId });
}
