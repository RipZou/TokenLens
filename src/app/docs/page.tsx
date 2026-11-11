import { AppHeader } from "@/components/app-header";
import { ApiDocs } from "@/components/api-docs";
import { requirePageUser } from "@/lib/auth/page-session";

export default async function DocsPage() {
  const session = await requirePageUser();

  return (
    <>
      <AppHeader current="/docs" email={session.email} />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <div>
          <h1 className="text-2xl font-semibold">API docs</h1>
          <p className="mt-2 text-gray-700">
            These are the v1 endpoints. Reporting a call needs a project API key. The live stream needs the signed-in session.
          </p>
        </div>
        <ApiDocs />
      </main>
    </>
  );
}
