import Link from "next/link";
import { AppHeader } from "@/components/app-header";
import { NewProjectForm } from "@/components/new-project-form";
import { requirePageUser } from "@/lib/auth/page-session";
import { projectDependencies } from "@/lib/auth/route-deps";
import { listProjectsForUser } from "@/lib/services/projects";

export default async function ProjectsPage() {
  const session = await requirePageUser();
  const deps = projectDependencies();
  if (deps instanceof Response) throw new Error("Server is not configured");
  const organizations = await listProjectsForUser(session.sub, deps);

  return (
    <>
      <AppHeader current="/projects" email={session.email} />
      <main className="mx-auto max-w-5xl space-y-6 px-4 py-8">
        <h1 className="text-2xl font-semibold">Projects</h1>
        {organizations.length === 0 ? (
          <p className="rounded-lg bg-white p-6 text-gray-700 shadow-sm">
            You are not a member of any organization yet. Ask an Admin to add you.
          </p>
        ) : null}
        {organizations.map((organization) => (
          <section key={organization.id} className="rounded-lg bg-white p-6 shadow-sm">
            <h2 className="text-lg font-semibold">
              {organization.name} <span className="text-sm font-normal text-gray-600">· {organization.role.toLowerCase()}</span>
            </h2>
            {organization.projects.length === 0 ? (
              <p className="mt-2 text-gray-700">No projects yet.</p>
            ) : (
              <ul className="mt-3 divide-y divide-gray-100">
                {organization.projects.map((project) => (
                  <li key={project.id} className="py-2">
                    <Link href={`/projects/${project.id}`} className="text-blue-700 underline">
                      {project.name}
                    </Link>
                  </li>
                ))}
              </ul>
            )}
            {organization.canCreateProject ? (
              <NewProjectForm orgId={organization.id} />
            ) : (
              <p className="mt-4 text-sm text-gray-600">Viewers can&apos;t create projects.</p>
            )}
          </section>
        ))}
      </main>
    </>
  );
}
