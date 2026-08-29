"use client";

import {
  createContext,
  useContext,
  useEffect,
  useState,
  type ReactNode,
} from "react";
import {
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from "firebase/auth";
import { firebaseAuth, firebaseEnabled, googleProvider } from "@/lib/firebase";
import { mergeLocalIntoAccount } from "@/lib/progress";

interface AuthState {
  user: User | null;
  enabled: boolean;
  /** False while a sign-in merge is still folding local progress in. */
  ready: boolean;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({
  user: null,
  enabled: false,
  ready: true,
  signIn: async () => {},
  signOutUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [ready, setReady] = useState(true);

  useEffect(() => {
    const auth = firebaseAuth();
    if (!auth) return;
    // Progress written while signed out lives in localStorage. Fold it into the
    // account here, on the transition into a signed-in state, so it happens
    // once per sign-in no matter which page the student lands on -- a student
    // who signs in and goes straight to a pattern must not see a half-merged
    // view. `ready` gates readers until it resolves.
    return onAuthStateChanged(auth, (next) => {
      setUser(next);
      if (!next) return;
      setReady(false);
      void mergeLocalIntoAccount(next.uid).finally(() => setReady(true));
    });
  }, []);

  async function signIn(): Promise<void> {
    const auth = firebaseAuth();
    if (!auth) return;
    try {
      await signInWithPopup(auth, googleProvider);
    } catch (e) {
      console.error("auth: sign-in failed", e);
    }
  }

  async function signOutUser(): Promise<void> {
    const auth = firebaseAuth();
    if (!auth) return;
    try {
      await signOut(auth);
    } catch (e) {
      console.error("auth: sign-out failed", e);
    }
  }

  return (
    <AuthCtx.Provider value={{ user, enabled: firebaseEnabled, ready, signIn, signOutUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthCtx);
}
