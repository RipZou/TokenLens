import { handleAddMember } from "@/lib/services/organizations";
import { organizationDependencies } from "@/lib/services/route-deps";

export async function POST(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<Response> {
  const deps = organizationDependencies();
  if (deps instanceof Response) return deps;
  const { orgId } = await params;
  return handleAddMember(request, orgId, deps);
}
