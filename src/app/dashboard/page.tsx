import { cookies } from "next/headers";
import { redirect } from "next/navigation";
import { SignOutButton } from "@/components/sign-out-button";
import { readSession, SESSION_COOKIE } from "@/lib/auth/session";

export default async function DashboardPage() {
  const token = (await cookies()).get(SESSION_COOKIE)?.value;
  const session = token ? await readSession(token, process.env.JWT_SECRET ?? "") : null;
  if (!session) redirect("/sign-in");

  return (
    <main className="mx-auto flex min-h-screen max-w-3xl items-center px-4">
      <section className="w-full rounded-lg bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Dashboard</h1>
        <p className="mt-2 text-gray-700">Signed in as {session.email}.</p>
        <p className="mt-2 text-gray-700">Call reports and spending charts are not on this page yet.</p>
        <SignOutButton />
      </section>
    </main>
  );
}
