import type { NextConfig } from "next";

/**
 * Security response headers.
 *
 * Scope: this is the whole security-header surface for the app. Netlify serves
 * the site and adds none of these, and there is no middleware, so what is
 * listed here is what ships.
 *
 * On `script-src 'unsafe-inline'`: the CodeGuard client-side-web-security
 * standard asks for a nonce. A nonce has to be minted per request, which means
 * every page renders dynamically — and 60 of this app's routes are prerendered
 * (all 27 patterns, all 27 quizzes, the home page). Next also emits inline
 * bootstrap and flight-data scripts on those static pages that a nonce would
 * have to cover. Paying for a nonce means giving up static rendering
 * everywhere, so this deliberately stops short: the directives below still
 * pin script *origins*, kill plugins and base-tag injection, block framing,
 * and hold connect/frame to a Google allowlist. Lifting `'unsafe-inline'`
 * needs middleware and the loss of SSG, and is tracked as its own decision.
 */

/**
 * Firebase Auth serves its sign-in helper iframe from the project's auth
 * domain, so the CSP has to name it. It is a NEXT_PUBLIC_* value and already
 * public — it ships in the browser bundle by design. When Firebase is not
 * configured the app runs sign-in-free, and the entry is simply omitted.
 */
const authDomain = process.env.NEXT_PUBLIC_FIREBASE_AUTH_DOMAIN;
const firebaseFrame = authDomain ? ` https://${authDomain}` : "";

/**
 * `next dev` needs two things this policy otherwise forbids: React's dev build
 * calls `eval()` for callstack reconstruction, and hot reload opens a
 * websocket back to the dev server. Both are development-only — React never
 * calls eval in a production build, and there is no HMR socket in one — so
 * they are granted here rather than weakening what actually ships. Verified by
 * curling the built output: neither appears in the production header.
 */
const isDev = process.env.NODE_ENV !== "production";
const devScript = isDev ? " 'unsafe-eval'" : "";
const devConnect = isDev ? " ws://localhost:* http://localhost:*" : "";

const csp = [
  "default-src 'self'",
  // 'unsafe-inline' is required by Next's inline bootstrap on prerendered
  // pages; apis.google.com is the gapi loader behind signInWithPopup.
  `script-src 'self' 'unsafe-inline'${devScript} https://apis.google.com`,
  // Tailwind ships a stylesheet, but the pattern/quiz views set a few inline
  // style attributes (gold glows, the quiz progress bar width).
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data:",
  "font-src 'self'",
  // Identity Toolkit and Secure Token for auth, Firestore for progress.
  // Firestore prefers WebChannel over https but can fall back to a websocket,
  // so both googleapis schemes are allowed; *.firebaseio.com covers the
  // Realtime Database endpoints the SDK probes even when unused.
  "connect-src 'self' https://*.googleapis.com wss://*.googleapis.com " +
    `https://*.firebaseio.com wss://*.firebaseio.com${devConnect}`,
  // The sign-in popup's iframe.
  `frame-src 'self' https://accounts.google.com${firebaseFrame}`,
  "object-src 'none'",
  "base-uri 'self'",
  "form-action 'self'",
  "frame-ancestors 'none'",
  "upgrade-insecure-requests",
].join("; ");

const securityHeaders = [
  { key: "Content-Security-Policy", value: csp },
  // Legacy-browser fallback for the frame-ancestors directive above.
  { key: "X-Frame-Options", value: "DENY" },
  { key: "X-Content-Type-Options", value: "nosniff" },
  { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
  // The app uses none of these; deny them rather than inherit browser defaults.
  { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
  // Two years, matching the preload-list requirement. Netlify terminates TLS
  // and redirects http->https, so no subdomain is expected to need plain http.
  { key: "Strict-Transport-Security", value: "max-age=63072000; includeSubDomains; preload" },
];

const nextConfig: NextConfig = {
  reactStrictMode: true,
  headers() {
    return Promise.resolve([{ source: "/:path*", headers: securityHeaders }]);
  },
};

export default nextConfig;
