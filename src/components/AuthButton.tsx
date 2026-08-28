"use client";

import { useAuth } from "@/context/AuthContext";

export default function AuthButton() {
  const { user, enabled, signIn, signOutUser } = useAuth();
  if (!enabled) return null;
  if (!user) {
    return (
      <button
        onClick={() => void signIn()}
        className="rounded bg-blue-600 px-3 py-1.5 font-medium text-white hover:bg-blue-500"
      >
        Sign in
      </button>
    );
  }
  return (
    <button
      onClick={() => void signOutUser()}
      className="rounded px-2 py-1 text-zinc-400 hover:bg-zinc-800"
      title={user.displayName ?? "Signed in"}
    >
      Sign out
    </button>
  );
}
