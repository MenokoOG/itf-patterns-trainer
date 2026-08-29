import { createRemoteJWKSet, jwtVerify } from "jose";

/**
 * Server-side Firebase ID token verification.
 *
 * Firebase ID tokens are RS256 JWTs signed by Google. Verifying them against
 * Google's published public keys needs only the project ID, so this deliberately
 * avoids firebase-admin and the service-account private key it would require.
 *
 * Fails closed: any missing config, bad signature, wrong issuer/audience, or
 * expired token yields null. Callers treat null as unauthenticated.
 */

const JWKS_URL = new URL(
  "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com",
);

/** Module-level so Google's keys are fetched and cached per instance, not per request. */
const jwks = createRemoteJWKSet(JWKS_URL);

export interface VerifiedUser {
  readonly uid: string;
}

/**
 * Verify a Firebase ID token and return its subject.
 *
 * @param token Raw JWT, without the "Bearer " prefix.
 * @returns The verified user, or null if the token is absent, malformed, or invalid.
 */
export async function verifyIdToken(token: string): Promise<VerifiedUser | null> {
  const projectId = process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID;
  if (!projectId || !token) return null;

  try {
    const { payload } = await jwtVerify(token, jwks, {
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      algorithms: ["RS256"],
    });

    // `sub` is the Firebase uid. jose validates exp/nbf/iss/aud; a token with an
    // empty subject is still structurally valid, so reject it explicitly.
    const uid = typeof payload.sub === "string" ? payload.sub : "";
    if (!uid) return null;

    return { uid };
  } catch {
    // Signature, expiry, issuer and audience failures all land here. The reason
    // is never surfaced to the client: it only tells an attacker what to fix.
    return null;
  }
}

/** Pull the bearer token out of an Authorization header. Returns "" when absent. */
export function bearerFrom(req: Request): string {
  const header = req.headers.get("authorization") ?? "";
  const match = /^Bearer (.+)$/.exec(header);
  return match?.[1]?.trim() ?? "";
}
