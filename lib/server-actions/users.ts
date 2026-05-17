"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "./_action";
import { db } from "@/lib/db/client";
import * as users from "@/lib/services/users";

export async function updateProfileAction(input: users.UpdateProfileInput) {
  const r = await withSessionContext((db, ctx) => users.updateProfile(db, ctx, input));
  if (r.ok) {
    revalidatePath("/customer/settings/profile", "page");
    revalidatePath("/employee/settings/profile", "page");
    revalidatePath("/admin/settings/profile", "page");
  }
  return r;
}

/**
 * Accept an invitation token: creates the user row + credential account.
 * Pre-auth (no session) so the caller is the invitee, not an existing user.
 */
export async function acceptInvitationAction(input: users.AcceptInvitationInput) {
  return users.acceptInvitation(db, input);
}
