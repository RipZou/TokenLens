import { budgetDependencies } from "@/lib/auth/route-deps";
import { handlePutModelPrice } from "@/lib/services/budgets";

export async function PUT(request: Request): Promise<Response> {
  const deps = budgetDependencies();
  if (deps instanceof Response) return deps;
  return handlePutModelPrice(request, deps);
}
