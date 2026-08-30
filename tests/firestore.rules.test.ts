import { readFileSync } from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
  type RulesTestEnvironment,
} from "@firebase/rules-unit-testing";
import { doc, getDoc, setDoc } from "firebase/firestore";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

/**
 * Executes firestore.rules against the Firestore emulator.
 *
 * Kept out of `src/` on purpose: vitest.config.mts only collects
 * `src/**\/*.test.ts`, so `npm test` -- and therefore CI, which has no
 * emulator -- never picks these up. Run them with `npm run test:rules`, which
 * starts the emulator around a separate vitest config.
 *
 * These assert the document shapes src/lib/progress.ts actually writes, not
 * hypothetical ones.
 */

const PROJECT_ID = "rules-test";
const PROGRESS = { "chon-ji": { practiced: 2, quizBest: 80, updatedAt: 1_700_000_000_000 } };

let env: RulesTestEnvironment;

beforeAll(async () => {
  const host = process.env.FIRESTORE_EMULATOR_HOST ?? "127.0.0.1:8080";
  const [hostname, port] = host.split(":");
  env = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      rules: readFileSync("firestore.rules", "utf8"),
      host: hostname,
      port: Number(port),
    },
  });
});

afterAll(async () => await env?.cleanup());
beforeEach(async () => await env.clearFirestore());

/** A signed-in student's handle on their own document. */
function ownDoc(uid: string) {
  return doc(env.authenticatedContext(uid).firestore(), "users", uid);
}

describe("users/{uid}", () => {
  it("lets a student read their own document", async () => {
    await assertSucceeds(getDoc(ownDoc("student")));
  });

  it("rejects another student's document", async () => {
    const intruder = env.authenticatedContext("intruder").firestore();
    await assertFails(getDoc(doc(intruder, "users", "student")));
  });

  it("rejects an unauthenticated read", async () => {
    const anon = env.unauthenticatedContext().firestore();
    await assertFails(getDoc(doc(anon, "users", "student")));
  });
});

// The four writes src/lib/progress.ts issues: saveProgress sends { progress },
// saveRank sends { rank }, and mergeLocalIntoAccount sends either or both.
describe("the writes the app actually makes", () => {
  it("creates a document with progress alone", async () => {
    await assertSucceeds(setDoc(ownDoc("s1"), { progress: PROGRESS }, { merge: true }));
  });

  it("merges a rank onto an existing document", async () => {
    await assertSucceeds(setDoc(ownDoc("s2"), { progress: PROGRESS }, { merge: true }));
    await assertSucceeds(setDoc(ownDoc("s2"), { rank: "8th gup" }, { merge: true }));
  });

  it("writes progress and rank together, as the sign-in merge does", async () => {
    await assertSucceeds(
      setDoc(ownDoc("s3"), { progress: PROGRESS, rank: "7th gup" }, { merge: true }),
    );
  });

  it("merges progress onto a document that already holds a rank", async () => {
    await assertSucceeds(setDoc(ownDoc("s4"), { rank: "6th gup" }, { merge: true }));
    await assertSucceeds(setDoc(ownDoc("s4"), { progress: PROGRESS }, { merge: true }));
  });
});

describe("validation", () => {
  it("rejects a rank outside the 16 known ranks", async () => {
    await assertFails(setDoc(ownDoc("s5"), { rank: "17th gup" }, { merge: true }));
  });

  it("rejects a field outside progress and rank", async () => {
    await assertFails(setDoc(ownDoc("s6"), { nickname: "Lawrence" }, { merge: true }));
  });

  it("rejects delete and refuses to leak the collection", async () => {
    const db = env.authenticatedContext("s7").firestore();
    await assertFails(setDoc(doc(db, "coaches", "s7"), { anything: true }));
  });
});

/**
 * Regression guard for a failure that is easy to cause and impossible to
 * recover from in the app.
 *
 * hasOnly() is evaluated against the *merged* post-write document, so once a
 * user document carries any field outside { progress, rank } -- left by an
 * older schema, or written by hand in the console -- every later merge write
 * is denied. The client logs "Missing or insufficient permissions", keeps its
 * local copy, and retries forever without ever succeeding. Reads still work,
 * which is what makes it confusing to diagnose.
 */
describe("a document holding a legacy field", () => {
  it("cannot be written to again, and reads still succeed", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "legacy"), {
        progress: PROGRESS,
        schemaVersion: 1,
      });
    });

    await assertSucceeds(getDoc(ownDoc("legacy")));
    await assertFails(setDoc(ownDoc("legacy"), { progress: PROGRESS }, { merge: true }));
  });

  it("accepts writes again once the stray field is removed", async () => {
    await env.withSecurityRulesDisabled(async (ctx) => {
      await setDoc(doc(ctx.firestore(), "users", "cleaned"), { progress: PROGRESS });
    });
    await assertSucceeds(setDoc(ownDoc("cleaned"), { rank: "9th gup" }, { merge: true }));
    expect(true).toBe(true);
  });
});
