"use server";

import { withSessionContext } from "./_action";
import * as search from "@/lib/services/search";

export async function searchAction(input: search.SearchInput) {
  return withSessionContext((db, ctx) => search.searchAll(db, ctx, input));
}

export async function adminSearchAction(orgId: string, input: search.SearchInput) {
  return withSessionContext(
    (db, ctx) => search.searchAll(db, ctx, input),
    { staffOrgId: orgId },
  );
}
