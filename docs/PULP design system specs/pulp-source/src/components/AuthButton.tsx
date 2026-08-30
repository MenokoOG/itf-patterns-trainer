"use client";

import { useAuth } from "@/context/AuthContext";

export default function AuthButton() {
  const { user, enabled, signIn, signOutUser } = useAuth();
  if (!enabled) return null;
  if (!user) {
    return (
      <button
        onClick={() => void signIn()}
        className="pulp-btn pulp-btn-gold px-4 py-2"
      >
        Sign in
      </button>
    );
  }
  return (
    <button
      onClick={() => void signOutUser()}
      className="pulp-link text-on-ink"
      title={user.displayName ?? "Signed in"}
    >
      Sign out
    </button>
  );
}
