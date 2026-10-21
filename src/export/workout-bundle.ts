import { parseAllDocuments } from 'yaml';

/**
 * Workouts out and back in as plain YAML.
 *
 * Not a ZIP. ADR-0012 rules out a second archive dependency for this, and one file of
 * YAML documents separated by `---` is the format's own answer to "several of these":
 * readable in any editor, hand-editable, and it round-trips.
 *
 * The rule everything here exists to keep is ADR-0014's: the stored source text is the
 * workout. Nothing in this module serialises a parsed tree — the export concatenates the
 * stored text and the import slices the text back out of the file by the byte offsets the
 * `yaml` parser reports. A serialiser would drop the comments and the layout the ADR
 * exists to preserve, which is the one bug this app has already decided not to have.
 *
 * What the file is called is ./file-name.ts, with the rest of the download names.
 */

/** A document separator on its own line, which is what the slice reads back. */
const SEPARATOR = '---\n';

/**
 * Every workout as one file, each document exactly the bytes that were stored.
 *
 * The only thing added is the separator, and a newline before it where a source did not
 * end in one — `---` has to start a line to be a separator at all. Nothing is reformatted,
 * reindented or re-emitted.
 */
export function bundleWorkoutSources(sources: readonly string[]): string {
  return sources.map((source) => (source.endsWith('\n') ? source : `${source}\n`)).join(SEPARATOR);
}

export interface WorkoutDocument {
  /**
   * Its position in the file, 1-based, as the rider would count documents when they open
   * it. Kept through the blank ones that are dropped below, so the alert names the
   * document they would find by counting rather than one off it.
   */
  index: number;
  /** The document's own text, sliced out of the file. Never re-serialised. */
  source: string;
}

/**
 * Splits a bundle into its documents, each one a slice of the original text.
 *
 * The byte offsets come from `yaml`: every document it parses carries a range, and the
 * start of the next document is the end of this one. Taken that way rather than from
 * `range[2]`, which stops at the document's own content — a comment sitting between two
 * documents belongs to the one above it, and a one-character gap after an empty document
 * would otherwise land in the next slice.
 *
 * The first document starts at offset 0 rather than at its range, because `yaml` reports
 * a document as beginning after the comments above it and the comment at the top of a
 * file is the most likely one in the whole bundle to be worth keeping.
 *
 * Total and non-throwing: a document with a syntax error still has a range, so one broken
 * workout in a file of twenty costs the other nineteen nothing. Whether a slice is a
 * workout is parseWorkout's question, asked by the caller.
 */
export function splitWorkoutDocuments(text: string): WorkoutDocument[] {
  const documents = parseAllDocuments(text);

  return (
    documents
      .map((document, position) => {
        const start = position === 0 ? 0 : document.range[0];
        const next = documents[position + 1];
        const end = next === undefined ? text.length : next.range[0];
        return { index: position + 1, source: stripMarker(text.slice(start, end)) };
      })
      // A file that ends in `---`, or that has a stray separator in it, parses as a document
      // with nothing in it. That is a formatting artefact rather than a workout the rider
      // expected to arrive, so it is dropped rather than reported as unreadable.
      .filter((document) => document.source.trim() !== '')
  );
}

/**
 * Drops the `---` that opens a document, which is the separator rather than part of the
 * workout. Only a marker alone on its line: `--- name: Foo` is a document written on one
 * line and cutting it would take the workout with it.
 */
function stripMarker(source: string): string {
  const marker = /^---[ \t]*(\r?\n|$)/.exec(source);
  return marker === null ? source : source.slice(marker[0].length);
}
