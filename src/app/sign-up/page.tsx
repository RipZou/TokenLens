import { CredentialsForm } from "@/components/credentials-form";

export default function SignUpPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <section className="w-full rounded-lg bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Create an account</h1>
        <p className="mt-2 text-gray-700">Register with an email and a password of at least 8 characters.</p>
        <CredentialsForm
          endpoint="/api/auth/register"
          submitLabel="Create account"
          alternateHref="/sign-in"
          alternateLabel="Already have an account? Sign in"
        />
      </section>
    </main>
  );
}
