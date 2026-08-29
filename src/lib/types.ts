/** Domain types for Chang-Hon ITF pattern data. */

export interface Movement {
  readonly number: number;
  readonly text: string;
  /** Execution note, e.g. "Perform 2 and 3 in a fast motion." */
  readonly note?: string;
}

export interface Pattern {
  readonly name: string;
  /** e.g. "Yellow Tip / 9th Gup" or "3rd Dan" */
  readonly rank: string;
  readonly readyStance: string;
  readonly movementCount: number;
  readonly meaning: string;
  /** Ending instruction, e.g. "Bring the left foot back to a ready posture." */
  readonly end: string;
  readonly movements: readonly Movement[];
}

export interface PatternSummary {
  readonly slug: string;
  readonly name: string;
  readonly rank: string;
  readonly movementCount: number;
}

export interface PatternProgress {
  practiced: number;
  quizBest: number;
  updatedAt: number;
}

export type ProgressMap = Record<string, PatternProgress>;

/** One requirement from a rank syllabus, as printed in the TITF handbooks. */
export interface SyllabusEntry {
  readonly english: string;
  /** Korean romanisation, when the handbook gives one. */
  readonly korean: string | null;
}

/** A numbered requirement group, e.g. "2. Defensive techniques". */
export interface SyllabusSection {
  readonly n: number;
  readonly title: string;
  readonly items: readonly SyllabusEntry[];
}

/** Everything one rank must show to be promoted. */
export interface SyllabusRank {
  /** e.g. "10th gup", "3rd dan" */
  readonly rank: string;
  /** e.g. "White belt", "Yellow stripe" */
  readonly belt: string;
  readonly promotesTo: string;
  /** Handbook this rank was extracted from. */
  readonly source: string;
  readonly sections: readonly SyllabusSection[];
}
