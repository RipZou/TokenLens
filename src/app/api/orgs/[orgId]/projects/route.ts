import { projectDependencies } from "@/lib/auth/route-deps";
import { handleCreateProject } from "@/lib/services/projects";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<Response> {
  const deps = projectDependencies();
  if (deps instanceof Response) return deps;
  const { orgId } = await params;
  return handleCreateProject(request, orgId, deps);
}
