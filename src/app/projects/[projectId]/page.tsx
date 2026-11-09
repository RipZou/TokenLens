import Link from "next/link";
import { notFound } from "next/navigation";
import { ApiKeysPanel } from "@/components/api-keys-panel";
import { AppHeader } from "@/components/app-header";
import { requirePageUser } from "@/lib/auth/page-session";
import { projectDependencies } from "@/lib/auth/route-deps";
import { loadKeysPage } from "@/lib/services/projects";

export default async function ProjectKeysPage({ params }: { params: Promise<{ projectId: string }> }) {
  const session = await requirePageUser();
  const deps = projectDependencies();
  if (deps instanceof Response) throw new Error("Server is not configured");
  const { projectId } = await params;
  const page = await loadKeysPage(session.sub, projectId, deps);
  if (!page) notFound();

  const keys = page.keys.map((key) => ({
    id: key.id,
    prefix: key.prefix,
    createdAt: key.createdAt.toISOString(),
    revokedAt: key.revokedAt?.toISOString() ?? null,
  }));

  return (
    <>
      <AppHeader current="/projects" email={session.email} />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <p>
          <Link href="/projects" className="text-blue-700 underline">
            ← Projects
          </Link>
        </p>
        <h1 className="text-2xl font-semibold">API keys · {page.project.name}</h1>
        <ApiKeysPanel projectId={page.project.id} initialKeys={keys} canManage={page.canManageKeys} />
      </main>
    </>
  );
}
