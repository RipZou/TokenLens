import { readCookie, readSession, SESSION_COOKIE, type SessionClaims } from "@/lib/auth/session";

export async function requireUser(request: Request, secret: string): Promise<SessionClaims | Response> {
  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  const session = token ? await readSession(token, secret) : null;
  if (!session) return Response.json({ error: "Unauthorized" }, { status: 401 });
  return session;
}
