import { handleChangeRole } from "@/lib/services/organizations";
import { organizationDependencies } from "@/lib/services/route-deps";

export async function PATCH(
  request: Request,
  { params }: { params: Promise<{ orgId: string; userId: string }> },
): Promise<Response> {
  const deps = organizationDependencies();
  if (deps instanceof Response) return deps;
  const { orgId, userId } = await params;
  return handleChangeRole(request, orgId, userId, deps);
}
