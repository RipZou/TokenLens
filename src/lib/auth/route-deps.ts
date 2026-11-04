import type { AuthDependencies } from "@/lib/auth/handlers";
import { getUserRepository } from "@/lib/db/user-repository";

export function authDependencies(): AuthDependencies | Response {
  const secret = process.env.JWT_SECRET;
  if (!secret) {
    return Response.json({ error: "Server is missing JWT_SECRET" }, { status: 500 });
  }
  return {
    users: getUserRepository(),
    secret,
    secure: process.env.NODE_ENV === "production",
  };
}
