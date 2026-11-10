import { budgetDependencies } from "@/lib/auth/route-deps";
import { handleGetBudgets, handlePutBudget } from "@/lib/services/budgets";

export async function GET(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<Response> {
  const deps = budgetDependencies();
  if (deps instanceof Response) return deps;
  const { orgId } = await params;
  return handleGetBudgets(request, orgId, deps);
}

export async function PUT(
  request: Request,
  { params }: { params: Promise<{ orgId: string }> },
): Promise<Response> {
  const deps = budgetDependencies();
  if (deps instanceof Response) return deps;
  const { orgId } = await params;
  return handlePutBudget(request, orgId, deps);
}
