import { CredentialsForm } from "@/components/credentials-form";

export default function SignInPage() {
  return (
    <main className="mx-auto flex min-h-screen max-w-md items-center px-4">
      <section className="w-full rounded-lg bg-white p-8 shadow-sm">
        <h1 className="text-2xl font-semibold">Sign in</h1>
        <p className="mt-2 text-gray-700">Use the email and password for your TokenLens account.</p>
        <CredentialsForm
          endpoint="/api/auth/sign-in"
          submitLabel="Sign in"
          alternateHref="/sign-up"
          alternateLabel="Create an account"
        />
      </section>
    </main>
  );
}
