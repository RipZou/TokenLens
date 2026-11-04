import { readRequestSession } from "@/lib/auth/session";

export async function gateDashboard(
  request: Request,
  options: { secret: string },
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  if (path !== "/dashboard" && !path.startsWith("/dashboard/")) return null;

  if (await readRequestSession(request, options.secret)) return null;
  return Response.redirect(new URL("/sign-in", request.url), 307);
}
