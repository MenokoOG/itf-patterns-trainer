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

interface AuthState {
  user: User | null;
  enabled: boolean;
  signIn: () => Promise<void>;
  signOutUser: () => Promise<void>;
}

const AuthCtx = createContext<AuthState>({
  user: null,
  enabled: false,
  signIn: async () => {},
  signOutUser: async () => {},
});

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);

  useEffect(() => {
    const auth = firebaseAuth();
    if (!auth) return;
    return onAuthStateChanged(auth, setUser);
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
    <AuthCtx.Provider value={{ user, enabled: firebaseEnabled, signIn, signOutUser }}>
      {children}
    </AuthCtx.Provider>
  );
}

export function useAuth(): AuthState {
  return useContext(AuthCtx);
}
