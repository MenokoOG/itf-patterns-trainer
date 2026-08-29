import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

/**
 * Unit tests only. Everything under test is pure logic -- progress merging,
 * rank joins, and the rank vocabulary shared with firestore.rules -- so there
 * is no DOM environment and no component rendering here.
 *
 * The `@/` alias mirrors tsconfig.json so tests import exactly what the app
 * imports.
 */
export default defineConfig({
  resolve: {
    alias: {
      "@": fileURLToPath(new URL("./src", import.meta.url)),
    },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
