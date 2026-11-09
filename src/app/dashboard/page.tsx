import { AppHeader } from "@/components/app-header";
import { requirePageUser } from "@/lib/auth/page-session";

export default async function DashboardPage() {
  const session = await requirePageUser();

  return (
    <>
      <AppHeader current="/dashboard" email={session.email} />
      <main className="mx-auto max-w-5xl px-4 py-8">
        <section className="rounded-lg bg-white p-8 shadow-sm">
          <h1 className="text-2xl font-semibold">Dashboard</h1>
          <p className="mt-2 text-gray-700">Call reports and spending charts are not on this page yet.</p>
        </section>
      </main>
    </>
  );
}
