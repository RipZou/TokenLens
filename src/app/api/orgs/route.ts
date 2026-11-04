import { handleCreateOrganization } from "@/lib/services/organizations";
import { organizationDependencies } from "@/lib/auth/route-deps";

export async function POST(request: Request): Promise<Response> {
  const deps = organizationDependencies();
  if (deps instanceof Response) return deps;
  return handleCreateOrganization(request, deps);
}
