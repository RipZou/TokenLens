import Link from "next/link";
import { SignOutButton } from "@/components/sign-out-button";

const LINKS = [
  { href: "/dashboard", label: "Dashboard" },
  { href: "/budgets", label: "Budgets" },
  { href: "/projects", label: "Projects" },
  { href: "/docs", label: "Docs" },
];

export function AppHeader({ current, email }: { current: string; email: string }) {
  return (
    <header className="border-b border-gray-200 bg-white">
      <div className="mx-auto flex max-w-5xl flex-wrap items-center gap-4 px-4 py-3">
        <span className="text-lg font-bold">TokenLens</span>
        <nav aria-label="Main" className="flex gap-1">
          {LINKS.map((link) => (
            <Link
              key={link.href}
              href={link.href}
              aria-current={current === link.href ? "page" : undefined}
              className="rounded px-3 py-2 text-gray-700 aria-[current=page]:bg-blue-50 aria-[current=page]:font-semibold aria-[current=page]:text-blue-800"
            >
              {link.label}
            </Link>
          ))}
        </nav>
        <div className="ml-auto flex items-center gap-3">
          <span className="text-sm text-gray-600">{email}</span>
          <SignOutButton />
        </div>
      </div>
    </header>
  );
}
