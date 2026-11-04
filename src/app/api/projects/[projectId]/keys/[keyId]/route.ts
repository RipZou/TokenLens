import { projectDependencies } from "@/lib/auth/route-deps";
import { handleRevokeApiKey } from "@/lib/services/projects";

export async function DELETE(
  request: Request,
  { params }: { params: Promise<{ projectId: string; keyId: string }> },
): Promise<Response> {
  const deps = projectDependencies();
  if (deps instanceof Response) return deps;
  const { projectId, keyId } = await params;
  return handleRevokeApiKey(request, projectId, keyId, deps);
}
