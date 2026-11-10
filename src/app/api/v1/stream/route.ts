import { streamDependencies } from "@/lib/auth/route-deps";
import { handleProjectStream } from "@/lib/services/stream";

export async function GET(request: Request): Promise<Response> {
  const deps = streamDependencies();
  if (deps instanceof Response) return deps;
  return handleProjectStream(request, deps);
}
