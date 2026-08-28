"use client";

import { getApps, initializeApp, type FirebaseApp } from "firebase/app";
import { getAuth, GoogleAuthProvider, type Auth } from "firebase/auth";
import { getFirestore, type Firestore } from "firebase/firestore";

/**
 * Env-guarded Firebase client init. If NEXT_PUBLIC_FIREBASE_* vars are not
 * set, every export is null and the app runs sign-in-free with
 * localStorage-only progress.
 */

const config = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY,
  authDomain: process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN,
  projectId: process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID,
  storageBucket: process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET,
  messagingSenderId: process.env.NEXT_PUBLIC_FIREBASE_MESSAGING_SENDER_ID,
  appId: process.env.NEXT_PUBLIC_FIREBASE_APP_ID,
};

export const firebaseEnabled: boolean = Boolean(config.apiKey && config.projectId && config.appId);

function app(): FirebaseApp {
  return getApps()[0] ?? initializeApp(config);
}

export function firebaseAuth(): Auth | null {
  return firebaseEnabled ? getAuth(app()) : null;
}

export function firestoreDb(): Firestore | null {
  return firebaseEnabled ? getFirestore(app()) : null;
}

export const googleProvider = new GoogleAuthProvider();
