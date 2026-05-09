import { randomBytes } from "node:crypto";
import { hashPassword } from "better-auth/crypto";

export function generateInvitationToken(): string {
  return randomBytes(32).toString("base64url");
}

export async function hashUserPassword(password: string): Promise<string> {
  return hashPassword(password);
}
