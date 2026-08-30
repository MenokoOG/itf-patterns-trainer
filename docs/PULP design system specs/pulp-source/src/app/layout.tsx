import type { Metadata, Viewport } from "next";
import Link from "next/link";
import "./globals.css";
import { AuthProvider } from "@/context/AuthContext";
import AuthButton from "@/components/AuthButton";

export const metadata: Metadata = {
  title: "ITF Patterns Trainer",
  description:
    "Practice the Chang-Hon tuls: movements, meanings, quizzes, and an AI study coach.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="min-h-dvh">
        <AuthProvider>
          <header className="sticky top-0 z-10 border-b-2 border-gold bg-ink">
            <nav className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3.5">
              <Link
                href="/"
                className="font-display text-[17px] font-bold uppercase tracking-[0.14em] text-cream"
              >
                ITF Patterns
              </Link>
              <div className="flex items-center gap-3.5">
                <Link href="/progress" className="pulp-link text-gold">
                  Progress
                </Link>
                <Link href="/coach" className="pulp-link text-gold">
                  Coach
                </Link>
                <AuthButton />
              </div>
            </nav>
          </header>
          <main className="pb-24">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
