import { readRequestSession } from "@/lib/auth/session";

const PROTECTED_PATHS = ["/dashboard", "/projects", "/budgets"];

export async function gateProtectedPages(
  request: Request,
  options: { secret: string },
): Promise<Response | null> {
  const path = new URL(request.url).pathname;
  const isProtected = PROTECTED_PATHS.some((root) => path === root || path.startsWith(`${root}/`));
  if (!isProtected) return null;

  if (await readRequestSession(request, options.secret)) return null;
  return Response.redirect(new URL("/sign-in", request.url), 307);
}
