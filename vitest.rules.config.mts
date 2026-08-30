import { defineConfig } from "vitest/config";

/**
 * Firestore rules tests only. Separate from vitest.config.mts because these
 * need the Firestore emulator running, which CI does not provide -- keeping
 * them out of the default project means `npm test` stays hermetic.
 *
 * Run via `npm run test:rules`, which wraps this in `firebase emulators:exec`.
 */
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    // The emulator is a single shared instance; parallel files would race on
    // clearFirestore() between tests.
    fileParallelism: false,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
