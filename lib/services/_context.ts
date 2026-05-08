export type SystemRole = "customer" | "employee" | "admin";

export type Actor = {
  userId: string;
  role: SystemRole;
  membershipOrgId: string | null; // customers only — must equal OrgContext.orgId
};

export type OrgContext = {
  kind: "org";
  orgId: string;
  actor: Actor;
};

export type AdminContext = {
  kind: "admin";
  actor: Actor & { role: "admin" };
};

export type AnyContext = OrgContext | AdminContext;
