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
          <header className="sticky top-0 z-10 border-b border-zinc-800 bg-zinc-950/95 backdrop-blur">
            <nav className="mx-auto flex max-w-2xl items-center justify-between gap-2 px-4 py-3">
              <Link href="/" className="text-base font-bold tracking-tight">
                ITF Patterns
              </Link>
              <div className="flex items-center gap-3 text-sm">
                <Link href="/coach" className="rounded px-2 py-1 text-blue-300 hover:bg-zinc-800">
                  Coach
                </Link>
                <AuthButton />
              </div>
            </nav>
          </header>
          <main className="mx-auto max-w-2xl px-4 pb-24 pt-4">{children}</main>
        </AuthProvider>
      </body>
    </html>
  );
}
