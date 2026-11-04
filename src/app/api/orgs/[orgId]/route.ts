import { handleGetOrganization } from "@/lib/services/organizations";
import { organizationDependencies } from "@/lib/auth/route-deps";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<Response> {
  const deps = organizationDependencies();
  if (deps instanceof Response) return deps;
  const { orgId } = await params;
  return handleGetOrganization(request, orgId, deps);
}
