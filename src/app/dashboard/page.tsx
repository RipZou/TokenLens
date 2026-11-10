import { AppHeader } from "@/components/app-header";
import { BudgetNotifier } from "@/components/budget-panel";
import { requirePageUser } from "@/lib/auth/page-session";
import { organizationDependencies } from "@/lib/auth/route-deps";

export default async function DashboardPage() {
  const session = await requirePageUser();
  const deps = organizationDependencies();
  if (deps instanceof Response) throw new Error("Server is not configured");
  const organizations = await deps.orgs.listForUser(session.sub);

  return (
    <>
      <AppHeader current="/dashboard" email={session.email} />
      <BudgetNotifier orgs={organizations.map((organization) => ({ id: organization.id, name: organization.name }))} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <section className="rounded-lg bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-2 text-gray-700">Call reports and spending charts are not on this page yet.</p>
        </section>
      </main>
    </>
  );
}
