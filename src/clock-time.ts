import type Hls from 'hls.js';

/** The fragment fields the conversions read. hls.js gives every fragment a `programDateTime`, filling in between tags. */
export interface TimedFragment {
  readonly start: number;
  readonly programDateTime: number | null;
}

/** Index of the last fragment whose `key` is at or before `value`, or -1. Fragments are in timeline order. */
function lastAtOrBefore(
  fragments: readonly TimedFragment[],
  value: number,
  key: (fragment: TimedFragment) => number
): number {
  let low = 0;
  let high = fragments.length - 1;
  let found = -1;

  while (low <= high) {
    const mid = (low + high) >> 1;
    if (key(fragments[mid]!) <= value) {
      found = mid;
      low = mid + 1;
    } else {
      high = mid - 1;
    }
  }

  return found;
}

/**
 * Wall-clock time, in milliseconds since the epoch, at `time` seconds on the timeline of `fragments`. Times outside the
 * playlist extrapolate from its first or last fragment. `NaN` when the playlist has no PDT.
 */
export function fragmentsDateAt(fragments: readonly TimedFragment[], time: number): number {
  if (fragments.length === 0 || !Number.isFinite(time)) return Number.NaN;

  const index = Math.max(
    0,
    lastAtOrBefore(fragments, time, (f) => f.start)
  );
  const fragment = fragments[index]!;
  if (fragment.programDateTime === null) return Number.NaN;

  return fragment.programDateTime + (time - fragment.start) * 1000;
}

/**
 * Time in seconds on the timeline of `fragments` at `date`, in milliseconds since the epoch. Dates outside the playlist
 * extrapolate from its first or last fragment. `NaN` when the playlist has no PDT.
 */
export function fragmentsTimeAt(fragments: readonly TimedFragment[], date: number): number {
  if (fragments.length === 0 || !Number.isFinite(date) || fragments[0]!.programDateTime === null) return Number.NaN;

  const index = Math.max(
    0,
    lastAtOrBefore(fragments, date, (f) => f.programDateTime ?? Number.NaN)
  );
  const fragment = fragments[index]!;
  if (fragment.programDateTime === null) return Number.NaN;

  return fragment.start + (date - fragment.programDateTime) / 1000;
}

/**
 * Wall-clock time, in milliseconds since the epoch, at `time` seconds on the stream's timeline, from its
 * `#EXT-X-PROGRAM-DATE-TIME`. `NaN` without an engine, before the first playlist loads, or when the stream has no
 * PDT.
 */
export function programDateTimeAt(hls: Hls | null | undefined, time: number): number {
  return fragmentsDateAt(hls?.latestLevelDetails?.fragments ?? [], time);
}

/**
 * Time in seconds on the stream's timeline at `date`, a `Date` or milliseconds since the epoch, from its
 * `#EXT-X-PROGRAM-DATE-TIME`. Seek to it to play a wall-clock moment. `NaN` without an engine, before the first playlist
 * loads, or when the stream has no PDT.
 */
export function mediaTimeAt(hls: Hls | null | undefined, date: Date | number): number {
  return fragmentsTimeAt(hls?.latestLevelDetails?.fragments ?? [], +date);
}
