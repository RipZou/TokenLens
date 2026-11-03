import { readCookie, readSession, SESSION_COOKIE } from "@/lib/auth/session";

export async function gateDashboard(
  request: Request,
  options: { secret: string },
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== "/dashboard" && !path.startsWith("/dashboard/")) return null;

  const token = readCookie(request.headers.get("cookie"), SESSION_COOKIE);
  const session = token ? await readSession(token, options.secret) : null;
  if (session) return null;
  return Response.redirect(new URL("/sign-in", request.url), 307);
}
