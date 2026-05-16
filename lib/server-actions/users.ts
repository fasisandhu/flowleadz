"use server";

import { revalidatePath } from "next/cache";
import { withSessionContext } from "./_action";
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
