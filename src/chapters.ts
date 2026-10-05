/** A point in wall-clock time: a `Date`, milliseconds since the epoch, or an ISO 8601 string. */
export type ClockTime = Date | number | string;

/** A chapter in wall-clock time, as a schedule describes it. Without an `end`, it runs until the next one starts. */
export interface ChapterInput {
  start: ClockTime;
  end?: ClockTime | null;
  title: string;
}

/** A chapter in milliseconds since the epoch. An `end` of `Infinity` is still running. */
export interface Chapter {
  start: number;
  end: number;
  title: string;
}

/** The `DateRange` fields read from hls.js `LevelDetails.dateRanges`. */
export interface DateRangeLike {
  readonly startDate: Date;
  readonly endDate: Date | null;
  readonly plannedDuration: number | null;
  readonly attr: Record<string, unknown>;
}

/** Chapters shorter than this, in milliseconds, are rounding left over from cutting, not content. */
const MIN_LENGTH = 500;

function toMilliseconds(time: ClockTime | null | undefined): number {
  if (time === null || time === undefined) return Number.NaN;
  if (typeof time === 'string') return Date.parse(time);
  return +time;
}

/** Sorts and validates a schedule. An entry without an end runs until the next one starts, or stays open if last. */
export function toChapters(input: readonly ChapterInput[]): Chapter[] {
  const chapters = input
    .map(({ start, end, title }) => ({ start: toMilliseconds(start), end: toMilliseconds(end), title: String(title) }))
    .filter(({ start }) => Number.isFinite(start))
    .toSorted((a, b) => a.start - b.start);

  return chapters
    .map((chapter, i) => ({
      ...chapter,
      end: Number.isFinite(chapter.end) ? chapter.end : (chapters[i + 1]?.start ?? Number.POSITIVE_INFINITY),
    }))
    .filter(({ start, end }) => end - start >= MIN_LENGTH);
}

/**
 * The SCTE-35 breaks among a playlist's `#EXT-X-DATERANGE` tags: those with `SCTE35-OUT`. hls.js merges the tags that
 * share an ID, so a break closed by a later `SCTE35-IN` tag carries its end. A break with no end yet runs for its
 * `PLANNED-DURATION`, or stays open.
 */
export function adBreaks(dateRanges: Record<string, DateRangeLike | undefined>, title: string): Chapter[] {
  const breaks: Chapter[] = [];

  for (const range of Object.values(dateRanges)) {
    if (!range || !('SCTE35-OUT' in range.attr)) continue;

    const start = range.startDate.getTime();
    const end =
      range.endDate?.getTime() ??
      (range.plannedDuration === null ? Number.POSITIVE_INFINITY : start + range.plannedDuration * 1000);

    if (end - start >= MIN_LENGTH) breaks.push({ start, end, title });
  }

  return breaks.toSorted((a, b) => a.start - b.start);
}

/** Lays `breaks` over `programs`: each break replaces the part of any program it covers. */
export function mergeChapters(programs: readonly Chapter[], breaks: readonly Chapter[]): Chapter[] {
  if (breaks.length === 0) return [...programs];

  const pieces: Chapter[] = [...breaks];

  for (const program of programs) {
    let start = program.start;

    for (const cut of breaks) {
      if (cut.end <= start || cut.start >= program.end) continue;
      if (cut.start - start >= MIN_LENGTH) pieces.push({ ...program, start, end: cut.start });
      start = Math.max(start, cut.end);
    }

    if (program.end - start >= MIN_LENGTH) pieces.push({ ...program, start });
  }

  return pieces.toSorted((a, b) => a.start - b.start);
}
