import { projectDependencies } from "@/lib/auth/route-deps";
import { handleCreateApiKey, handleListApiKeys } from "@/lib/services/projects";

type Context = { params: Promise<{ projectId: string }> };

export async function GET(request: Request, { params }: Context): Promise<Response> {
  const deps = projectDependencies();
  if (deps instanceof Response) return deps;
  const { projectId } = await params;
  return handleListApiKeys(request, projectId, deps);
}

export async function POST(request: Request, { params }: Context): Promise<Response> {
  const deps = projectDependencies();
  if (deps instanceof Response) return deps;
  const { projectId } = await params;
  return handleCreateApiKey(request, projectId, deps);
}
