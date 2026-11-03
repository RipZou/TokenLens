"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export function SignOutButton() {
  const [pending, setPending] = useState(false);
  const router = useRouter();

  async function signOut() {
    setPending(true);
    await fetch("/api/auth/sign-out", { method: "POST" });
    router.push("/sign-in");
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={signOut}
      disabled={pending}
      className="mt-6 rounded border border-gray-300 px-4 py-2 disabled:opacity-60"
    >
      {pending ? "Signing out…" : "Sign out"}
    </button>
  );
}
