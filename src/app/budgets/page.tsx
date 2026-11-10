import { AppHeader } from "@/components/app-header";
import { BudgetNotifier, BudgetPanel, ModelPriceForm } from "@/components/budget-panel";
import { requirePageUser } from "@/lib/auth/page-session";
import { organizationDependencies } from "@/lib/auth/route-deps";

export default async function BudgetsPage() {
  const session = await requirePageUser();
  const deps = organizationDependencies();
  if (deps instanceof Response) throw new Error("Server is not configured");
  const organizations = await deps.orgs.listForUser(session.sub);
  const canEdit = organizations.some((organization) => organization.role === "ADMIN");

  return (
    <>
      <AppHeader current="/budgets" email={session.email} />
      <BudgetNotifier orgs={organizations.map((organization) => ({ id: organization.id, name: organization.name }))} />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold">Budgets & alerts</h1>
          <p className="mt-2 text-gray-700">
            A day starts at 00:00 UTC. A month starts at 00:00 UTC on the 1st. Spending is checked about once a second, so a
            new 80% or 100% alert shows within two seconds. Each threshold is stored once for that budget and period.
          </p>
          {canEdit ? null : (
            <p className="mt-2 text-gray-700">You can view budgets. Only Admins can change them.</p>
          )}
        </div>
        {organizations.length === 0 ? (
          <p className="rounded-lg bg-white p-6 text-gray-700 shadow-sm">You are not a member of any organization yet.</p>
        ) : null}
        {canEdit ? <ModelPriceForm /> : null}
        {organizations.map((organization) => (
          <BudgetPanel
            key={organization.id}
            orgId={organization.id}
            orgName={organization.name}
            canEdit={organization.role === "ADMIN"}
          />
        ))}
      </main>
    </>
  );
}
