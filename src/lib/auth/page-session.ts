import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { readSession, SESSION_COOKIE, type SessionClaims } from "@/lib/auth/session";

export async function requirePageUser(): Promise<SessionClaims> {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? await readSession(token, process.env.JWT_SECRET ?? "") : null;
  if (!session) redirect("/sign-in");
  return session;
}
